import {Token, LazyTokenCacheData, getImage, getStartLine, getStartColumn, ISimpleTokenOrIToken} from "./tokens_public"
import {
    validatePatterns,
    analyzeTokenClasses,
    countLineTerminators,
    DEFAULT_MODE,
    performRuntimeChecks,
    checkLazyMode,
    analyzeTokenClassesForStreamingLexer,
    checkSimpleMode,
    cloneEmptyGroups
} from "./lexer"
import {
    cloneObj,
    isEmpty,
    map,
    isArray,
    forEach,
    merge,
    last,
    keys,
    isUndefined,
    reject,
    cloneArr,
    flatten,
    mapValues
} from "../utils/utils"
import {
    fillUpLineToOffset,
    getStartColumnFromLineToOffset,
    getStartLineFromLineToOffset,
    augmentTokenClasses,
    createSimpleLazyToken,
    LazyTokenCreator,
    createLazyTokenInstance,
    tokenStructuredMatcher
} from "./tokens"

export interface TokenConstructor extends Function {
    GROUP?:string
    PATTERN?:RegExp
    LABEL?:string
    LONGER_ALT?:TokenConstructor

    tokenType?:number
    extendingTokenTypes?:number[]
    TRANSFORMED_PATTERN?:RegExp

    new(...args:any[]):ISimpleTokenOrIToken
}

export interface ILexingResult {
    tokens:Token[]
    groups:{ [groupName:string]:Token }
    errors:ILexingError[]
}

export enum LexerDefinitionErrorType {
    MISSING_PATTERN,
    INVALID_PATTERN,
    EOI_ANCHOR_FOUND,
    UNSUPPORTED_FLAGS_FOUND,
    DUPLICATE_PATTERNS_FOUND,
    INVALID_GROUP_TYPE_FOUND,
    PUSH_MODE_DOES_NOT_EXIST,
    MULTI_MODE_LEXER_WITHOUT_DEFAULT_MODE,
    MULTI_MODE_LEXER_WITHOUT_MODES_PROPERTY,
    MULTI_MODE_LEXER_DEFAULT_MODE_VALUE_DOES_NOT_EXIST,
    LEXER_DEFINITION_CANNOT_CONTAIN_UNDEFINED,
    LEXER_DEFINITION_CANNOT_MIX_LAZY_AND_NOT_LAZY,
    LEXER_DEFINITION_CANNOT_MIX_SIMPLE_AND_NOT_SIMPLE
}

export interface ILexerDefinitionError {
    message:string
    type:LexerDefinitionErrorType
    tokenClasses?:Function[]
}

export interface ILexingError {
    line:number
    column:number
    length:number
    message:string
}

export type SingleModeLexerDefinition = TokenConstructor[]
export type MultiModesDefinition = { [modeName:string]:TokenConstructor[] }

export interface IMultiModeLexerDefinition {
    modes:MultiModesDefinition
    defaultMode:string
}

export class Lexer {

    public static SKIPPED = {
        description: "This marks a skipped Token pattern, this means each token identified by it will" +
                     "be consumed and then throw into oblivion, this can be used to for example: skip whitespace."
    }

    public static NA = /NOT_APPLICABLE/
    public lexerDefinitionErrors:ILexerDefinitionError[] = []

    protected isLazyTokenMode
    protected isSimpleTokenMode
    protected modes:string[] = []
    protected defaultMode:string
    protected allPatterns:{ [modeName:string]:RegExp[] } = {}
    protected patternIdxToClass:{ [modeName:string]:Function[] } = {}
    protected patternIdxToGroup:{ [modeName:string]:string[] } = {}
    protected patternIdxToLongerAltIdx:{ [modeName:string]:number[] } = {}
    protected patternIdxToCanLineTerminator:{ [modeName:string]:boolean[] } = {}
    protected patternIdxToPushMode:{ [modeName:string]:string[] } = {}
    protected patternIdxToPopMode:{ [modeName:string]:boolean[] } = {}
    protected emptyGroups:{ [groupName:string]:ISimpleTokenOrIToken } = {}


    /**
     * @param {SingleModeLexerDefinition | IMultiModeLexerDefinition} lexerDefinition -
     *  Structure composed of constructor functions for the Tokens types this lexer will support.
     *
     *  In the case of {SingleModeLexerDefinition} the structure is simply an array of Token constructors.
     *  In the case of {IMultiModeLexerDefinition} the structure is an object with two properties:
     *    1. a "modes" property where each value is an array of Token.
     *    2. a "defaultMode" property specifying the initial lexer mode.
     *
     *  constructors.
     *
     *  for example:
     *  {
     *     "modes" : {
     *     "modeX" : [Token1, Token2]
     *     "modeY" : [Token3, Token4]
     *     }
     *
     *     "defaultMode" : "modeY"
     *  }
     *
     *  A lexer with {MultiModesDefinition} is simply multiple Lexers where only one (mode) can be active at the same time.
     *  This is useful for lexing languages where there are different lexing rules depending on context.
     *
     *  The current lexing mode is selected via a "mode stack".
     *  The last (peek) value in the stack will be the current mode of the lexer.
     *
     *  Each Token class can define that it will cause the Lexer to (after consuming an instance of the Token):
     *  1. PUSH_MODE : push a new mode to the "mode stack"
     *  2. POP_MODE  : pop the last mode from the "mode stack"
     *
     *  Examples:
     *       export class Attribute extends Token {
     *          static PATTERN = ...
     *          static PUSH_MODE = "modeY"
     *       }
     *
     *       export class EndAttribute extends Token {
     *          static PATTERN = ...
     *          static POP_MODE = true
     *       }
     *
     *  The Token constructors must be in one of these forms:
     *
     *  1. With a PATTERN property that has a RegExp value for tokens to match:
     *     example: -->class Integer extends Token { static PATTERN = /[1-9]\d }<--
     *
     *  2. With a PATTERN property that has the value of the var Lexer.NA defined above.
     *     This is a convenience form used to avoid matching Token classes that only act as categories.
     *     example: -->class Keyword extends Token { static PATTERN = NA }<--
     *
     *
     *   The following RegExp patterns are not supported:
     *   a. '$' for match at end of input
     *   b. /b global flag
     *   c. /m multi-line flag
     *
     *   The Lexer will identify the first pattern that matches, Therefor the order of Token Constructors may be significant.
     *   For example when one pattern may match a prefix of another pattern.
     *
     *   Note that there are situations in which we may wish to order the longer pattern after the shorter one.
     *   For example: keywords vs Identifiers.
     *   'do'(/do/) and 'donald'(/w+)
     *
     *   * If the Identifier pattern appears before the 'do' pattern, both 'do' and 'donald'
     *     will be lexed as an Identifier.
     *
     *   * If the 'do' pattern appears before the Identifier pattern 'do' will be lexed correctly as a keyword.
     *     however 'donald' will be lexed as TWO separate tokens: keyword 'do' and identifier 'nald'.
     *
     *   To resolve this problem, add a static property on the keyword's constructor named: LONGER_ALT
     *   example:
     *
     *       export class Identifier extends Keyword { static PATTERN = /[_a-zA-Z][_a-zA-Z0-9]/ }
     *       export class Keyword extends Token {
     *          static PATTERN = lex.NA
     *          static LONGER_ALT = Identifier
     *       }
     *       export class Do extends Keyword { static PATTERN = /do/ }
     *       export class While extends Keyword { static PATTERN = /while/ }
     *       export class Return extends Keyword { static PATTERN = /return/ }
     *
     *   The lexer will then also attempt to match a (longer) Identifier each time a keyword is matched.
     *
     *
     * @param {boolean} [deferDefinitionErrorsHandling=false] -
     *                  An optional flag indicating that lexer definition errors
     *                  should not automatically cause an error to be raised.
     *                  This can be useful when wishing to indicate lexer errors in another manner
     *                  than simply throwing an error (for example in an online playground).
     */
    constructor(protected lexerDefinition:SingleModeLexerDefinition | IMultiModeLexerDefinition,
                deferDefinitionErrorsHandling:boolean = false) {

        let actualDefinition:IMultiModeLexerDefinition

        // Convert SingleModeLexerDefinition into a IMultiModeLexerDefinition.
        if (isArray(lexerDefinition)) {
            actualDefinition = <any>{modes: {}}
            actualDefinition.modes[DEFAULT_MODE] = cloneArr(<SingleModeLexerDefinition>lexerDefinition)
            actualDefinition[DEFAULT_MODE] = DEFAULT_MODE
        }
        // no conversion needed, input should already be a IMultiModeLexerDefinition
        else {
            actualDefinition = cloneObj(<IMultiModeLexerDefinition>lexerDefinition)
        }

        this.lexerDefinitionErrors = this.lexerDefinitionErrors.concat(performRuntimeChecks(actualDefinition))

        // for extra robustness to avoid throwing an none informative error message
        actualDefinition.modes = actualDefinition.modes ? actualDefinition.modes : {}

        // an error of undefined TokenClasses will be detected in "performRuntimeChecks" above.
        // this transformation is to increase robustness in the case of partially invalid lexer definition.
        forEach(actualDefinition.modes, (currModeValue, currModeName) => {
            actualDefinition.modes[currModeName] = reject<TokenConstructor>(currModeValue, (currTokClass) => isUndefined(currTokClass))
        })

        let allModeNames = keys(actualDefinition.modes)

        forEach(actualDefinition.modes, (currModDef:TokenConstructor[], currModName) => {
            this.modes.push(currModName)
            this.lexerDefinitionErrors = this.lexerDefinitionErrors.concat(
                validatePatterns(<SingleModeLexerDefinition>currModDef, allModeNames))

            // If definition errors were encountered, the analysis phase may fail unexpectedly/
            // Considering a lexer with definition errors may never be used, there is no point
            // to performing the analysis anyhow...
            if (isEmpty(this.lexerDefinitionErrors)) {
                augmentTokenClasses(currModDef)
                let currAnalyzeResult = analyzeTokenClasses(currModDef)
                this.allPatterns[currModName] = currAnalyzeResult.allPatterns
                this.patternIdxToClass[currModName] = currAnalyzeResult.patternIdxToClass
                this.patternIdxToGroup[currModName] = currAnalyzeResult.patternIdxToGroup
                this.patternIdxToLongerAltIdx[currModName] = currAnalyzeResult.patternIdxToLongerAltIdx
                this.patternIdxToCanLineTerminator[currModName] = currAnalyzeResult.patternIdxToCanLineTerminator
                this.patternIdxToPushMode[currModName] = currAnalyzeResult.patternIdxToPushMode
                this.patternIdxToPopMode[currModName] = currAnalyzeResult.patternIdxToPopMode
                this.emptyGroups = merge(this.emptyGroups, currAnalyzeResult.emptyGroups)
            }
        })

        this.defaultMode = actualDefinition.defaultMode
        let allTokensTypes:any = flatten(mapValues(actualDefinition.modes, (currModDef) => currModDef))

        // Lazy Mode handling
        let lazyCheckResult = checkLazyMode(allTokensTypes)
        this.isLazyTokenMode = lazyCheckResult.isLazy
        this.lexerDefinitionErrors = this.lexerDefinitionErrors.concat(lazyCheckResult.errors)

        // Simple Mode handling
        let simpleCheckResult = checkSimpleMode(allTokensTypes)
        this.isSimpleTokenMode = simpleCheckResult.isSimple
        this.lexerDefinitionErrors = this.lexerDefinitionErrors.concat(simpleCheckResult.errors)

        if (!isEmpty(this.lexerDefinitionErrors) && !deferDefinitionErrorsHandling) {
            let allErrMessages = map(this.lexerDefinitionErrors, (error) => {
                return error.message
            })
            let allErrMessagesString = allErrMessages.join("-----------------------\n")
            throw new Error("Errors detected in definition of Lexer:\n" + allErrMessagesString)
        }
    }

    /**
     * Will lex(Tokenize) a string.
     * Note that this can be called repeatedly on different strings as this method
     * does not modify the state of the Lexer.
     *
     * @param {string} text - The string to lex
     * @param {string} [initialMode] - The initial Lexer Mode to start with, by default this will be the first mode in the lexer's
     *                                 definition. If the lexer has no explicit modes it will be the implicit single 'default_mode' mode.
     *
     * @returns {ILexingResult}
     */
    public tokenize(text:string,
                    initialMode:string = this.defaultMode):ILexingResult {

        if (!isEmpty(this.lexerDefinitionErrors)) {
            let allErrMessages = map(this.lexerDefinitionErrors, (error) => {
                return error.message
            })
            let allErrMessagesString = allErrMessages.join("-----------------------\n")
            throw new Error("Unable to Tokenize because Errors detected in definition of Lexer:\n" + allErrMessagesString)
        }

        if (this.isLazyTokenMode) {
            if (this.isSimpleTokenMode) {
                return this.tokenizeInternalLazy(text, initialMode, createSimpleLazyToken)
            }
            else {
                return this.tokenizeInternalLazy(text, initialMode, createLazyTokenInstance)
            }

        }
        else {
            return this.tokenizeInternal(text, initialMode)
        }
    }

    // There is quite a bit of duplication between this and "tokenizeInternalLazy"
    // This is intentional due to performance considerations.
    private tokenizeInternal(text:string, initialMode:string):ILexingResult {
        let match, i, j, matchAlt, longerAltIdx, matchedImage, imageLength, group, tokClass, newToken, errLength,
            fixForEndingInLT, c, droppedChar, lastLTIdx, msg, lastCharIsLT
        let orgInput = text
        let offset = 0
        let matchedTokens = []
        let errors:ILexingError[] = []
        let line = 1
        let column = 1
        let groups:any = cloneEmptyGroups(this.emptyGroups)

        let currModePatterns = []
        let currModePatternsLength = 0
        let currModePatternIdxToLongerAltIdx = []
        let currModePatternIdxToGroup = []
        let currModePatternIdxToClass = []
        let currModePatternIdxToCanLineTerminator = []
        let patternIdxToPushMode = []
        let patternIdxToPopMode = []

        let modeStack = []
        let pop_mode = (popToken) => {
            // TODO: perhaps avoid this error in the edge case there is no more input?
            if (modeStack.length === 1) {
                // if we try to pop the last mode there lexer will no longer have ANY mode.
                // thus the pop is ignored, an error will be created and the lexer will continue parsing in the previous mode.
                let msg = `Unable to pop Lexer Mode after encountering Token ->${getImage(popToken)}<- The Mode Stack is empty`
                errors.push({
                    line:    getStartLine(popToken),
                    column:  getStartColumn(popToken),
                    length:  getImage(popToken).length,
                    message: msg
                })
            }
            else {
                modeStack.pop()
                let newMode = last(modeStack)
                currModePatterns = this.allPatterns[newMode]
                currModePatternsLength = currModePatterns.length
                currModePatternIdxToLongerAltIdx = this.patternIdxToLongerAltIdx[newMode]
                currModePatternIdxToGroup = this.patternIdxToGroup[newMode]
                currModePatternIdxToClass = this.patternIdxToClass[newMode]
                currModePatternIdxToCanLineTerminator = this.patternIdxToCanLineTerminator[newMode]
                patternIdxToPushMode = this.patternIdxToPushMode[newMode]
                patternIdxToPopMode = this.patternIdxToPopMode[newMode]
            }
        }

        function push_mode(newMode) {
            modeStack.push(newMode)
            currModePatterns = this.allPatterns[newMode]
            currModePatternsLength = currModePatterns.length
            currModePatternIdxToLongerAltIdx = this.patternIdxToLongerAltIdx[newMode]
            currModePatternIdxToGroup = this.patternIdxToGroup[newMode]
            currModePatternIdxToClass = this.patternIdxToClass[newMode]
            currModePatternIdxToCanLineTerminator = this.patternIdxToCanLineTerminator[newMode]
            patternIdxToPushMode = this.patternIdxToPushMode[newMode]
            patternIdxToPopMode = this.patternIdxToPopMode[newMode]
        }

        // this pattern seems to avoid a V8 de-optimization, although that de-optimization does not
        // seem to matter performance wise.
        push_mode.call(this, initialMode)

        while (text.length > 0) {
            match = null
            for (i = 0; i < currModePatternsLength; i++) {
                match = currModePatterns[i].exec(text)
                if (match !== null) {
                    // even though this pattern matched we must try a another longer alternative.
                    // this can be used to prioritize keywords over identifiers
                    longerAltIdx = currModePatternIdxToLongerAltIdx[i]
                    if (longerAltIdx) {
                        matchAlt = currModePatterns[longerAltIdx].exec(text)
                        if (matchAlt && matchAlt[0].length > match[0].length) {
                            match = matchAlt
                            i = longerAltIdx
                        }
                    }
                    break
                }
            }
            // successful match
            if (match !== null) {
                matchedImage = match[0]
                imageLength = matchedImage.length
                group = currModePatternIdxToGroup[i]
                if (group !== undefined) {
                    tokClass = currModePatternIdxToClass[i]
                    newToken = new tokClass(matchedImage, offset, line, column)
                    if (group === "default") {
                        matchedTokens.push(newToken)
                    }
                    else {
                        groups[group].push(newToken)
                    }
                }
                text = text.slice(imageLength)
                offset = offset + imageLength
                column = column + imageLength // TODO: with newlines the column may be assigned twice

                if (currModePatternIdxToCanLineTerminator[i]) {
                    let lineTerminatorsInMatch = countLineTerminators(matchedImage)
                    // TODO: identify edge case of one token ending in '\r' and another one starting with '\n'
                    if (lineTerminatorsInMatch !== 0) {
                        line = line + lineTerminatorsInMatch

                        lastLTIdx = imageLength - 1
                        while (lastLTIdx >= 0) {
                            c = matchedImage.charCodeAt(lastLTIdx)
                            // scan in reverse to find last lineTerminator in image
                            if (c === 13 || c === 10) { // '\r' or '\n'
                                break
                            }
                            lastLTIdx--
                        }
                        column = imageLength - lastLTIdx

                        if (group !== undefined) { // a none skipped multi line Token, need to update endLine/endColumn
                            lastCharIsLT = lastLTIdx === imageLength - 1
                            fixForEndingInLT = lastCharIsLT ?
                                -1 :
                                0

                            if (!(lineTerminatorsInMatch === 1 && lastCharIsLT)) {
                                // if a token ends in a LT that last LT only affects the line numbering of following Tokens
                                newToken.endLine = line + fixForEndingInLT
                                // the last LT in a token does not affect the endColumn either as the [columnStart ... columnEnd)
                                // inclusive to exclusive range.
                                newToken.endColumn = column - 1 + -fixForEndingInLT
                            }
                            // else single LT in the last character of a token, no need to modify the endLine/EndColumn
                        }
                    }
                }

                // mode handling, must pop before pushing if a Token both acts as both
                // otherwise it would be a NO-OP
                if (patternIdxToPopMode[i]) {
                    pop_mode(newToken)
                }
                if (patternIdxToPushMode[i]) {
                    push_mode.call(this, patternIdxToPushMode[i])
                }
            }
            else { // error recovery, drop characters until we identify a valid token's start point
                let errorStartOffset = offset
                let errorLine = line
                let errorColumn = column
                let foundResyncPoint = false
                while (!foundResyncPoint && text.length > 0) {
                    // drop chars until we succeed in matching something
                    droppedChar = text.charCodeAt(0)
                    if (droppedChar === 10 || // '\n'
                        (droppedChar === 13 &&
                        (text.length === 1 || (text.length > 1 && text.charCodeAt(1) !== 10)))) { //'\r' not followed by '\n'
                        line++
                        column = 1
                    }
                    else { // this else also matches '\r\n' which is fine, the '\n' will be counted
                        // either when skipping the next char, or when consuming the following pattern
                        // (which will have to start in a '\n' if we manage to consume it)
                        column++
                    }

                    text = text.substr(1)
                    offset++
                    for (j = 0; j < currModePatterns.length; j++) {
                        foundResyncPoint = currModePatterns[j].test(text)
                        if (foundResyncPoint) {
                            break
                        }
                    }
                }

                errLength = offset - errorStartOffset
                // at this point we either re-synced or reached the end of the input text
                msg = `unexpected character: ->${orgInput.charAt(errorStartOffset)}<- at offset: ${errorStartOffset},` +
                    ` skipped ${offset - errorStartOffset} characters.`
                errors.push({line: errorLine, column: errorColumn, length: errLength, message: msg})
            }
        }

        return {tokens: matchedTokens, groups: groups, errors: errors}
    }

    private tokenizeInternalLazy(text:string, initialMode:string, tokenCreator:LazyTokenCreator):ILexingResult {
        let match, i, j, matchAlt, longerAltIdx, matchedImage, imageLength, group, tokClass, newToken, errLength, droppedChar, msg

        let orgInput = text
        let offset = 0
        let matchedTokens = []
        let errors:ILexingError[] = []
        let groups:any = cloneEmptyGroups(this.emptyGroups)

        let currModePatterns = []
        let currModePatternsLength = 0
        let currModePatternIdxToLongerAltIdx = []
        let currModePatternIdxToGroup = []
        let currModePatternIdxToClass = []
        let patternIdxToPushMode = []
        let patternIdxToPopMode = []

        let lazyCacheData:LazyTokenCacheData = {
            orgText:      text,
            lineToOffset: []
        }

        let modeStack = []
        let pop_mode = (popToken) => {
            // TODO: perhaps avoid this error in the edge case there is no more input?
            if (modeStack.length === 1) {
                // if we try to pop the last mode there lexer will no longer have ANY mode.
                // thus the pop is ignored, an error will be created and the lexer will continue parsing in the previous mode.
                let msg = `Unable to pop Lexer Mode after encountering Token ->${getImage(popToken)}<- The Mode Stack is empty`
                errors.push({
                    line:    getStartLine(popToken),
                    column:  getStartColumn(popToken),
                    length:  getImage(popToken).length,
                    message: msg
                })
            }
            else {
                modeStack.pop()
                let newMode = last(modeStack)
                currModePatterns = this.allPatterns[newMode]
                currModePatternsLength = currModePatterns.length
                currModePatternIdxToLongerAltIdx = this.patternIdxToLongerAltIdx[newMode]
                currModePatternIdxToGroup = this.patternIdxToGroup[newMode]
                currModePatternIdxToClass = this.patternIdxToClass[newMode]
                patternIdxToPushMode = this.patternIdxToPushMode[newMode]
                patternIdxToPopMode = this.patternIdxToPopMode[newMode]
            }
        }

        function push_mode(newMode) {
            modeStack.push(newMode)
            currModePatterns = this.allPatterns[newMode]
            currModePatternsLength = currModePatterns.length
            currModePatternIdxToLongerAltIdx = this.patternIdxToLongerAltIdx[newMode]
            currModePatternIdxToGroup = this.patternIdxToGroup[newMode]
            currModePatternIdxToClass = this.patternIdxToClass[newMode]
            patternIdxToPushMode = this.patternIdxToPushMode[newMode]
            patternIdxToPopMode = this.patternIdxToPopMode[newMode]
        }

        // this pattern seems to avoid a V8 de-optimization, although that de-optimization does not
        // seem to matter performance wise.
        push_mode.call(this, initialMode)

        while (text.length > 0) {
            match = null
            for (i = 0; i < currModePatternsLength; i++) {
                match = currModePatterns[i].exec(text)
                if (match !== null) {
                    // even though this pattern matched we must try a another longer alternative.
                    // this can be used to prioritize keywords over identifiers
                    longerAltIdx = currModePatternIdxToLongerAltIdx[i]
                    if (longerAltIdx) {
                        matchAlt = currModePatterns[longerAltIdx].exec(text)
                        if (matchAlt && matchAlt[0].length > match[0].length) {
                            match = matchAlt
                            i = longerAltIdx
                        }
                    }
                    break
                }
            }
            // successful match
            if (match !== null) {
                matchedImage = match[0]
                imageLength = matchedImage.length
                group = currModePatternIdxToGroup[i]
                if (group !== undefined) {
                    tokClass = currModePatternIdxToClass[i]
                    // the end offset is non inclusive.
                    newToken = tokenCreator(offset, offset + imageLength - 1, tokClass, lazyCacheData)
                    if (group === "default") {
                        matchedTokens.push(newToken)
                    }
                    else {
                        groups[group].push(newToken)
                    }
                }
                text = text.slice(imageLength)
                offset = offset + imageLength

                // mode handling, must pop before pushing if a Token both acts as both
                // otherwise it would be a NO-OP
                if (patternIdxToPopMode[i]) {
                    pop_mode(newToken)
                }
                if (patternIdxToPushMode[i]) {
                    push_mode.call(this, patternIdxToPushMode[i])
                }
            }
            else { // error recovery, drop characters until we identify a valid token's start point
                let errorStartOffset = offset
                let foundResyncPoint = false
                while (!foundResyncPoint && text.length > 0) {
                    // drop chars until we succeed in matching something
                    droppedChar = text.charCodeAt(0)
                    text = text.substr(1)
                    offset++
                    for (j = 0; j < currModePatterns.length; j++) {
                        foundResyncPoint = currModePatterns[j].test(text)
                        if (foundResyncPoint) {
                            break
                        }
                    }
                }

                errLength = offset - errorStartOffset
                // at this point we either re-synced or reached the end of the input text
                msg = `unexpected character: ->${orgInput.charAt(errorStartOffset)}<- at offset: ${errorStartOffset},` +
                    ` skipped ${offset - errorStartOffset} characters.`

                if (isEmpty(lazyCacheData.lineToOffset)) {
                    fillUpLineToOffset(lazyCacheData.lineToOffset, lazyCacheData.orgText)
                }

                let errorLine = getStartLineFromLineToOffset(errorStartOffset, lazyCacheData.lineToOffset)
                let errorColumn = getStartColumnFromLineToOffset(errorStartOffset, lazyCacheData.lineToOffset)

                errors.push({line: errorLine, column: errorColumn, length: errLength, message: msg})
            }
        }

        return {tokens: matchedTokens, groups: groups, errors: errors}
    }
}

// Done:
// * multiple tokens lookahead (sequence lookahead) - V
// * lexerless lookahead with predicates - V
// * can't combine lexerless and recovery enabled - V
// * error recovery (or at least properly disable it (including top level) - V
//   - may need to change behavior of top level recovery - V
// * error messages (show first none ignored char?) - V
// * ruleFinallyClause - V

// Minimal
// * removed hard coded lexerless = true and pass params
// * Support all Token types
// * only concrete tokens in "extending_transformed_patterns"
// * Streaming Lexer definition errors handling
// * EOF handling from streamingLexer (currently return "null") but this is a different behavior.
// * Better skipping support
// * refactor to reduce code duplication.
// * Testing

// future milestones
// * Token groups
// * Relative order of inheriting TokenTypes?
// * relative order of groups(including skipped) and other tokens.
// * order of skipped patterns


// not supported (document)
// * Longer Alt ???


export class StreamingLexer {

    public lexerDefinitionErrors = []
    public tokenNameToPattern:{[tokenName:string]:RegExp}
    public tokenNameToGroup:{[tokenName:string]:string}
    public idxToPattern:{[tokenIdx:number]:RegExp}
    public skippedPatterns:RegExp[]
    public cacheData:LazyTokenCacheData
    public lastToken:ISimpleTokenOrIToken
    public lastLength:number
    public lastImage:string
    public skipped = false

    protected offset = 0
    protected nextOffset = 0


    constructor(public definition:SingleModeLexerDefinition, public text:string) {
        this.lexerDefinitionErrors = validatePatterns(definition, [])

        // If definition errors were encountered, the analysis phase may fail unexpectedly/
        // Considering a lexer with definition errors may never be used, there is no point
        // to performing the analysis anyhow...
        if (isEmpty(this.lexerDefinitionErrors)) {
            let analyzeResult = analyzeTokenClassesForStreamingLexer(definition)
            this.tokenNameToPattern = analyzeResult.tokenNameToPattern
            this.tokenNameToGroup = analyzeResult.tokenNameToGroup
            this.skippedPatterns = analyzeResult.skippedPatterns
            this.idxToPattern = analyzeResult.idxToPattern
        }

        this.cacheData = {
            orgText:      text,
            lineToOffset: []
        }
        // TODO: throw error if we have definition errors
    }

    lookAhead(expectedTokType:TokenConstructor):ISimpleTokenOrIToken {

        if (this.text.length === 0) {
            return null
            // return END_OF_FILE
        }

        if (this.lastToken !== null && tokenStructuredMatcher(this.lastToken, expectedTokType)) {
            return this.lastToken
        }

        if (this.skipped === false) {
            // TODO: this skipping loop is incorrect, need to use a "while" and exit only after a full loop did not match anything
            for (let i = 0; i < this.skippedPatterns.length; i++) {
                let currSkippedPattern = this.skippedPatterns[0]
                let skippedMatched = currSkippedPattern.exec(this.text)
                if (skippedMatched) {
                    let matchedImage = skippedMatched[0]
                    let skippedImageLength = matchedImage.length
                    this.text = this.text.slice(skippedImageLength)
                    this.offset = this.offset + skippedImageLength
                }
            }

            this.skipped = true
        }

        // let expectedTokenName = tokenName(expectedTokType)
        // let expectedTokenName = expectedTokType.name
        // let expectedTokenPattern = this.idxToPattern[(<any>expectedTokType).idx]
        let expectedTokenPattern = (<any>expectedTokType).TRANSFORMED_PATTERN

        let match = null
        if (expectedTokenPattern) {
            match = expectedTokenPattern.exec(this.text)
        }
        // TODO: need cleaner code to find patterns to match
        // TODO: do the extending patterns have a meaningful order?
        else {
            let extendingPatterns = (<any>expectedTokType).EXTENDING_TRANSFORMED_PATTERNS
            for (let i = 0; i < extendingPatterns.length; i++) {
                match = extendingPatterns[i].exec(this.text)
                if (match !== null) {
                    break
                }
            }
        }

        // successful match
        if (match !== null) {
            let matchedImage = match[0]
            let imageLength = matchedImage.length
            this.lastLength = imageLength
            let nextOffset = this.offset + imageLength
            this.nextOffset = nextOffset

            this.lastToken = createSimpleLazyToken(this.offset, nextOffset - 1, expectedTokType, this.cacheData)
            return this.lastToken
        }
        else {
            return null
        }
    }

    lookAheadSequence(expectedTokTypes:TokenConstructor[]):boolean {

        let text = this.text
        let offset = this.offset

        for (let currTokIdx = 0; currTokIdx < expectedTokTypes.length; currTokIdx++) {
            if (this.text.length === 0) {
                return false
            }

            // TODO: perf boost: use previous "skipped flag" information on first iteration?
            // skipped Tokens may appear between any two tokens in the sequence
            // TODO: this skipping loop is incorrect, need to use a "while" and exit only after a full loop did not match anything
            for (let i = 0; i < this.skippedPatterns.length; i++) {
                let currSkippedPattern = this.skippedPatterns[0]
                let skippedMatched = currSkippedPattern.exec(text)
                if (skippedMatched) {
                    let matchedImage = skippedMatched[0]
                    let skippedImageLength = matchedImage.length
                    text = text.slice(skippedImageLength)
                    offset = offset + skippedImageLength
                }
            }

            let expectedTokType = expectedTokTypes[currTokIdx]
            let expectedTokenPattern = (<any>expectedTokType).TRANSFORMED_PATTERN

            let match = null
            if (expectedTokenPattern) {
                match = expectedTokenPattern.exec(text)
            }

            // TODO: need cleaner code to find patterns to match
            // TODO: do the extending patterns have a meaningful order?
            else {
                let extendingPatterns = (<any>expectedTokType).EXTENDING_TRANSFORMED_PATTERNS
                for (let i = 0; i < extendingPatterns.length; i++) {
                    match = extendingPatterns[i].exec(text)
                    if (match !== null) {
                        break
                    }
                }
            }

            // successful match
            if (match !== null) {
                let matchedImage = match[0]
                let imageLength = matchedImage.length
                offset = offset + matchedImage.length
                text = text.slice(imageLength)
            } else {
                return false
            }
        }
        return true
    }

    consumeToken():void {
        let lastImageLength = this.lastLength
        this.text = this.text.slice(lastImageLength)
        this.offset = this.nextOffset
        this.lastToken = null
        this.skipped = false
    }

    // TODO use this in the constructor to avoid duplication.
    setInput(newText:string):void {
        this.text = newText
        this.offset = 0
        this.cacheData = {
            orgText:      newText,
            lineToOffset: []
        }
        this.lastToken = null
        this.lastImage = null
        this.skipped = false
    }

    getNextActualInput():string {
        if (this.text.length === 0) {
            return ""
        }

        let text = this.text
        let offset = this.offset

        // skipped Tokens may appear between any two tokens in the sequence
        // TODO: reuse code, stop copy pasting!
        // TODO: this skipping loop is incorrect, need to use a "while" and exit only after a full loop did not match anything
        for (let i = 0; i < this.skippedPatterns.length; i++) {
            let currSkippedPattern = this.skippedPatterns[0]
            let skippedMatched = currSkippedPattern.exec(text)
            if (skippedMatched) {
                let matchedImage = skippedMatched[0]
                let skippedImageLength = matchedImage.length
                text = text.slice(skippedImageLength)
                offset = offset + skippedImageLength
            }
        }

        if (text.length === 0) {
            return ""
        } else {
            return text[0]
        }
    }

    isAtEndOfInput():boolean {

        if (this.text === "") {
            return true
        }
        else {
            if (this.skipped === false) {
                // TODO: this skipping loop is incorrect, need to use a "while" and exit only after a full loop did not match anything
                for (let i = 0; i < this.skippedPatterns.length; i++) {
                    let currSkippedPattern = this.skippedPatterns[0]
                    let skippedMatched = currSkippedPattern.exec(this.text)
                    if (skippedMatched) {
                        let matchedImage = skippedMatched[0]
                        let skippedImageLength = matchedImage.length
                        this.text = this.text.slice(skippedImageLength)
                        this.offset = this.offset + skippedImageLength
                    }
                }

                this.skipped = true
                return this.text === ""
            }
        }
        return false
    }

}
