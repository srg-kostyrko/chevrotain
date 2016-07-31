// wrapping in UMD to allow code to work both in node.js (the tests/specs)
// and in the browser (css_diagrams.html)
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require("chevrotain"), require("lodash"));
    } else {
        // Browser globals (root is window)\
        root["lexerModule"] = factory(root.chevrotain, root._);
    }
}(this, function(chevrotain, _) {
    "use strict"

    var extendToken = chevrotain.extendToken
    var Lexer = chevrotain.Lexer
    var Token = chevrotain.Token

    // Flow Tokens
    class LCurly extends Token {}
    class RCurly extends Token {}
    class LSquare extends Token {}
    class RSquare extends Token {}
    class Comma extends Token {}

    // Block Tokens
    class DashDashDash extends Token {}
    class DotDotDot extends Token {}
    class ColonSpace extends Token {}
    class QuestionSpace extends Token {}
    class DashSpace extends Token {}

    // 6.1. Indentation Spaces
    // http://yaml.org/spec/1.2/spec.html#id2777534
    class INDENT extends Token {}
    // used to indicate a 'virtual' indentation of zero spaces for the top level block.
    class ZERO_SPACE_INDENT extends INDENT {}

    class DEDENT extends Token {}
    class SAME_INDENT extends Token {}

    // 6.9.1. Node Tags
    // http://yaml.org/spec/1.2/spec.html#id2784064
    class Tag extends Token {}

    // 6.9.2. Node Anchors
    // http://yaml.org/spec/1.2/spec.html#id2785586
    class AnchorDef extends Token {}
    class AnchorRef extends Token {}

    // common Tokens

    // 6.2. Separation Spaces
    // http://yaml.org/spec/1.2/spec.html#id2778241 -
    class SeparationSpaces extends Token {}
    class LineBreak extends Token {}

    // 6.4. Empty Lines
    // http://yaml.org/spec/1.2/spec.html#id2778853
    class EmptyLine extends Token {}


    class PlainScalar extends Token {}
    class SingleQuoteScalar extends Token {}
    class SingleQuoteMultiLineScalar extends Token {}
    class DoubleQuoteScalar extends Token {}
    class DoubleQuoteMultilineScalar extends Token {}

    const BLOCK = "BLOCK"
    const FLOW = "FLOW"
    const PREFIX = "PREFIX"

    const FLOW_IN = "FLOW_IN"
    const FLOW_OUT = "FLOW_OUT"
    const FLOW_NONE = false

    const SPACE = " "
    const TAB = "\t"
    const CARRIAGE_RETURN = "\r"
    const LINE_FEED = "\n"

    const FLOW_INDICATORS = [",", "[", "]", "{", "}"]
    const WHITE_SPACE_CHARS = [SPACE, TAB, CARRIAGE_RETURN, LINE_FEED]

    const skippedFlowTokens = [SeparationSpaces, LineBreak]
    const skippedBlockTokens = [SeparationSpaces, LineBreak]
    const skippedPrefixTokens = [SeparationSpaces, LineBreak]

    /**
     * @param {string} text
     *
     * @constructor
     */
    class YamlLexer {
        constructor(text) {
            this.text = text
            this.currLine = 1
            this.currColumn = 1
            this.currOffset = 0
            this.errors = []
            this.stateAfterLastToken = {
                currLine:   1,
                currColumn: 1,
                currOffset: 0
            }

            this.stateToLastConsumption = {
                currLine:   1,
                currColumn: 1,
                currOffset: 0
            }
        }

        consumeToken() {

            // assumes consumeToken is only called
            this.currLine = this.stateAfterLastToken.currLine
            this.currColumn = this.stateAfterLastToken.currColumn
            this.currOffset = this.stateAfterLastToken.currOffset
            this.scannedIndentLast = this.stateAfterLastToken.scannedIndentLast
            // TODO: cloning? maybe concat additional errors
            // this.errors = this.errors.concat(this.stateAfterLastToken.additionalErrors)

            this.stateToLastConsumption.currLine = this.currLine
            this.stateToLastConsumption.currColumn = this.currColumn
            this.stateToLastConsumption.currOffset = this.currOffset
            this.stateToLastConsumption.scannedIndentLast = this.scannedIndentLast
        }

        lookahead(howMuch, lexerMode, indentationLevel, flowMode) {

            this.currLine = this.stateToLastConsumption.currLine
            this.currColumn = this.stateToLastConsumption.currColumn
            this.currOffset = this.stateToLastConsumption.currOffset
            this.scannedIndentLast = this.stateToLastConsumption.scannedIndentLast

            let nextTokenFunc
            let skippedTokens

            if (lexerMode === BLOCK) {
                nextTokenFunc = this.nextBlockToken
                skippedTokens = skippedBlockTokens
            }
            else if (lexerMode === FLOW) {
                nextTokenFunc = this.nextFlowToken
                skippedTokens = skippedFlowTokens
            }
            else { // lexerMode === PREFIX
                nextTokenFunc = this.nextPrefixToken
                skippedTokens = skippedPrefixTokens
            }

            let nextToken
            let numOfTokensLooked = 0
            while (true) {
                try {

                    if (this.currOffset > this.text.length - 1) {
                        return new chevrotain.EOF()
                    }

                    nextToken = nextTokenFunc.call(this, indentationLevel, flowMode)
                    // have to maintain the level of indentation in the lexer context to support token lookahead for K > 1.
                    // even though this will be recomputed at the parser level as well...
                    if (lexerMode === BLOCK &&
                        nextToken instanceof INDENT ||
                        nextToken instanceof DEDENT) {
                        indentationLevel = nextToken.image.length
                    }

                    this.scannedIndentLast = nextToken instanceof ZERO_SPACE_INDENT ||
                        nextToken instanceof SAME_INDENT

                    if (!_.includes(skippedTokens, nextToken.constructor)) {

                        numOfTokensLooked++

                        if (numOfTokensLooked === howMuch) {
                            this.stateAfterLastToken = {
                                currLine:          this.currLine,
                                currColumn:        this.currColumn,
                                currOffset:        this.currOffset,
                                scannedIndentLast: this.scannedIndentLast
                                // TODO: need to save errors too
                            }
                            return nextToken
                        }
                    }
                }
                catch (e) {
                    throw e
                    // TODO: combine error messages of sequences instead of one error message per unexpected character
                    // TODO: need to save errors too
                }
            }
        }

        nextPrefixToken(indentationLevel) {
            var startLine = this.currLine
            var startColumn = this.currColumn
            var startOffset = this.currOffset
            // TODO: track endLine for multi line tokens support

            var ch

            // TODO: support multi line tokens and Indentation
            // TODO: indicators count as part of the indent

            if (startColumn === 1 && !this.scannedIndentLast) {
                var possibleIndentToken = this.scanIndentation(indentationLevel, startOffset, startLine, startColumn)
                if (possibleIndentToken !== undefined) {
                    return possibleIndentToken
                }
            }

            ch = this.NEXT_CHAR()
            switch (ch) {
                case "-" :
                    return this.scanDashDashDash(startLine, startColumn, startOffset)
                    break
                case "\r" :
                    return this.scanCarriageReturn(startLine, startColumn, startOffset)
                    break
                case "\n" :
                    return this.scanLineFeed(startLine, startColumn, startOffset)
                    break
                case SPACE:
                    return new SeparationSpaces(SPACE, startOffset, startLine, startColumn)
                default:
                    // add resync code here
                    throw new Error("sad sad panda, nothing matched")
            }
        }

        nextBlockToken(indentationLevel) {
            var startLine = this.currLine
            var startColumn = this.currColumn
            var startOffset = this.currOffset
            // TODO: track endLine for multi line tokens support

            var ch

            // TODO: support multi line tokens and Indentation
            // TODO: indicators count as part of the indent
            if (startColumn === 1 && !this.scannedIndentLast) {
                var possibleIndentToken = this.scanIndentation(indentationLevel, startOffset, startLine, startColumn)
                if (possibleIndentToken !== undefined) {
                    return possibleIndentToken
                }
            }

            ch = this.NEXT_CHAR()
            switch (ch) {
                // opening Curly brackets belong in Block mode as well as Flow mode as it signals the transition Block-->Flow
                case "{":
                    return new LCurly("{", startOffset, startLine, startColumn)
                case "[":
                    // opening Square Brackets belong in Block mode as well as Flow mode as it signals the transition Block-->Flow
                    return new LSquare("[", startOffset, startLine, startColumn)
                case " " :
                    return this.scanSeparationSpaces(startLine, startColumn, startOffset)
                case "\t" :
                    return this.scanSeparationSpaces(startLine, startColumn, startOffset)
                case "\r" :
                    return this.scanCarriageReturn(startLine, startColumn, startOffset)
                case "\n" :
                    return this.scanLineFeed(startLine, startColumn, startOffset)
                case "\"":
                    return this.scanDoubleQuoteScalar(startLine, startColumn, startOffset)
                case "'":
                    return this.scanSingleQuoteScalar(startLine, startColumn, startOffset)
                // TODO: a plain scalar can start with a colon in some cases
                case ":":
                    return this.scanColonSpace(startLine, startColumn, startOffset, FLOW_NONE)
                // TODO: a plain scalar can start with a dash in some cases
                case "-":
                    return this.scanDashSpace(startLine, startColumn, startOffset)
                default:
                    // add resync code here
                    throw new Error("sad sad panda, nothing matched >" + ch + "<")
            }
        }

        // TODO wrap in error recovery loop?
        nextFlowToken(indentationLevel, flowMode) {
            var startLine = this.currLine
            var startColumn = this.currColumn
            var startOffset = this.currOffset
            // TODO: track endLine for multi line tokens support

            var ch = this.NEXT_CHAR()
            // add to switch case?
            if (this.isWhiteSpace(ch)) {
                return // ignore whitespace
            }

            // TODO: scan plainScalar handling
            switch (ch) {
                case "\r" :
                    return this.scanCarriageReturn(startLine, startColumn, startOffset)
                case "\n" :
                    return this.scanLineFeed(startLine, startColumn, startOffset)
                case " " :
                    return this.scanSeparationSpaces(startLine, startColumn, startOffset)
                case "\t" :
                    return this.scanSeparationSpaces(startLine, startColumn, startOffset)
                case "\"":
                    return this.scanDoubleQuoteScalar(startLine, startColumn, startOffset)
                case "'":
                    return this.scanSingleQuoteScalar(startLine, startColumn, startOffset)
                case ",":
                    return new Comma(",", startOffset, startLine, startColumn)
                case "{":
                    return new LCurly("{", startOffset, startLine, startColumn)
                case "}":
                    return new RCurly("}", startOffset, startLine, startColumn)
                case "[":
                    return new LSquare("[", startOffset, startLine, startColumn)
                case "]":
                    return new RSquare("]", startOffset, startLine, startColumn)
                // TODO: a plain scalar can start with a colon in some cases
                case ":":
                    return this.scanColonSpace(startLine, startColumn, startOffset, flowMode)
                // DashSpace belong in Flow mode as well as it can appear right after a flow mode
                // and on the exit from any rule the next Token is checked for error recovery purposes to verify it is not EOF.
                // TODO: a plain scalar can start with a dash in some cases
                case "-":
                    return this.scanDashSpace(startLine, startColumn, startOffset)
                default:
                    // add resync code here
                    throw new Error("sad sad panda, nothing matched >" + ch + "<")
            }
        }

        scanColonSpace(startLine, startColumn, startOffset, flowMode) {
            var ch2 = this.PEEK_CHAR()


            if (_.includes(WHITE_SPACE_CHARS, ch2) ||
                (flowMode === FLOW_IN && _.includes(FLOW_INDICATORS, ch2))) {

                // a colonSpace followed  by FLOW_INDICATOR when in flow_in mode is only one character long.
                if (_.includes(WHITE_SPACE_CHARS, ch2)) {
                    this.NEXT_CHAR()

                    if (ch2 === CARRIAGE_RETURN) {
                        this.scanCarriageReturn(startLine, startColumn + 1, startOffset + 1)
                    }
                    else if (ch2 === LINE_FEED) {
                        this.scanLineFeed(startLine, startColumn + 1, startOffset + 1)
                    }
                }
                return this.CREATE_TOKEN(ColonSpace, startOffset, startLine, startColumn)
            }
            else {
                // TODO: better error message, depending on flowMode (in-flow, out-flow)
                throw new Error("A colon must be followed by a space character")
            }
        }

        scanDashSpace(startLine, startColumn, startOffset) {
            var ch2 = this.PEEK_CHAR()
            if (ch2 === SPACE ||
                ch2 === TAB ||
                ch2 === CARRIAGE_RETURN ||
                ch2 === LINE_FEED) {
                this.NEXT_CHAR()

                if (ch2 === CARRIAGE_RETURN) {
                    this.scanCarriageReturn(startLine, startColumn + 1, startOffset + 1)
                }
                else if (ch2 === LINE_FEED) {
                    this.scanLineFeed(startLine, startColumn + 1, startOffset + 1)
                }
                return this.CREATE_TOKEN(DashSpace, startOffset, startLine, startColumn)
            }
            else {
                throw new Error("In block mode a dash must be followed by a space character")
            }
        }

        scanDashDashDash(startLine, startColumn, startOffset) {

            var nextChar = this.PEEK_CHAR()
            if (nextChar === "-") {
                this.NEXT_CHAR()
            }
            else {
                // TODO: better error description
                // TODO: only '---' is an indicator so '-' and '--' are  valid!
                throw Error("oops")
            }

            nextChar = this.PEEK_CHAR()
            if (nextChar === "-") {
                this.NEXT_CHAR()
                return this.CREATE_TOKEN(DashDashDash, startOffset, startLine, startColumn)
            }
            else {
                // TODO: better error description
                throw Error("oopsy")
            }
        }

        scanSeparationSpaces(startLine, startColumn, startOffset) {
            let stillSeparationSpaces = true

            while (stillSeparationSpaces) {
                let nc = this.PEEK_CHAR()
                if (nc === " " ||
                    nc === "\t") {
                    this.NEXT_CHAR()
                }
                else {
                    stillSeparationSpaces = false
                }
            }
            return this.CREATE_TOKEN(SeparationSpaces, startOffset, startLine, startColumn)
        }


        scanCarriageReturn(startLine, startColumn, startOffset) {
            var includesNewLine = false
            if (this.PEEK_CHAR() === "\n") {
                this.NEXT_CHAR()
                includesNewLine = true
            }
            this.currLine++
            this.currColumn = 1

            // create
            var image = includesNewLine ? "\r\n" : "\r"
            return new LineBreak("image", startOffset, startLine, startColumn)
        }

        scanLineFeed(startOffset, startLine, startColumn) {
            this.currLine++
            this.currColumn = 1

            return new LineBreak("\n", startOffset, startLine, startColumn)
        }

        isWhiteSpace() {

        }

        scanSingleQuoteScalar(startLine, startColumn, startOffset) {
            let nc = undefined
            let nc2 = undefined
            let foundTerminatingQuote = false

            var consumeChar = () => {
                nc = this.NEXT_CHAR()
                nc2 = this.PEEK_CHAR()
            }

            while (!foundTerminatingQuote) {
                consumeChar()
                // escaped "'"
                if (nc === "'" && nc2 === "'") {
                    consumeChar()
                }
                // terminating "'"
                else if (nc === "'") {
                    foundTerminatingQuote = true
                }
                // TODO handle multi - line quotes (this is context dependent?)
            }
            // TODO: handle unterminated edge case
            return this.CREATE_TOKEN(SingleQuoteScalar, startOffset, startLine, startColumn)
        }

        scanDoubleQuoteScalar(startLine, startColumn, startOffset) {
            let foundTerminatingQuote = false

            while (!foundTerminatingQuote) {
                let nc = this.PEEK_CHAR()
                if (nc === "\"") {
                    this.NEXT_CHAR()
                    foundTerminatingQuote = true
                }
                // still inside te single quoteScalar
                else {
                    this.NEXT_CHAR()
                }
                // TODO: handle escaping
                // TODO handle multi - line quotes (this is context dependent?)
            }
            // TODO: handle unterminated edge case
            return this.CREATE_TOKEN(DoubleQuoteScalar, startOffset, startLine, startColumn)
        }

        scanIndentation(indentationLevel, startOffset, startLine, startColumn) {
            var ch
            let currLineIndentationLevel = 0
            while (this.PEEK_CHAR() === SPACE) {
                ch = this.NEXT_CHAR()
                currLineIndentationLevel++
            }

            let firstCharAfterSpaces = this.PEEK_CHAR()
            // any of these indicate an empty line
            // TODO: extract this logic to a function
            if (firstCharAfterSpaces !== "\r" &&
                firstCharAfterSpaces !== "\n" &&
                firstCharAfterSpaces !== "#" &&
                (this.PEEK_CHAR(3) + this.PEEK_CHAR(2) + this.PEEK_CHAR(3) !== "...") &&
                (this.PEEK_CHAR(3) + this.PEEK_CHAR(2) + this.PEEK_CHAR(3) !== "---")) {

                // indent
                if (currLineIndentationLevel > indentationLevel) {
                    // ZERO Space indent
                    if (this.currColumn === 1) {
                        return this.CREATE_TOKEN(ZERO_SPACE_INDENT, startOffset, startLine, startColumn)
                    }
                    else {
                        return this.CREATE_TOKEN(INDENT, startOffset, startLine, startColumn)
                    }
                }
                // dedent
                else if (currLineIndentationLevel < indentationLevel) {
                    return this.CREATE_TOKEN(DEDENT, startOffset, startLine, startColumn)
                }
                else {
                    return this.CREATE_TOKEN(SAME_INDENT, startOffset, startLine, startColumn)
                }
            }
        }

        SKIP_CHAR() {
            // TODO: should line/column be handled here?
            // or was it handled externally?
            // probably externally if possible to avoid duplicate logic for different kinds of line breaks.
            this.currOffset++
        }

        /**
         * @return {string}
         */
        PEEK_CHAR(howFar) {
            if (howFar === undefined) {
                howFar = 1
            }
            return this.text.charAt(this.currOffset - 1 + howFar)
        }

        /**
         * @return {string}
         */
        NEXT_CHAR() {
            // TODO: should line breaks be handled here? or is it enough in the big switch case?
            this.currColumn++
            return this.text.charAt(this.currOffset++)
        }

        /**
         * @return {string}
         */
        LAST_TOKEN_IMAGE(startOffset) {
            return this.text.substring(startOffset, this.currOffset)
        }

        CREATE_TOKEN(tokType, startOffset, startLine, startColumn) {
            let image = this.LAST_TOKEN_IMAGE(startOffset)
            return new tokType(image, startOffset, startLine, startColumn, this.currLine, this.currColumn)
        }
    }


    return {

        YamlLexer: YamlLexer,

        // lexer modes
        BLOCK:  BLOCK,
        FLOW:   FLOW,
        PREFIX: PREFIX,

        // flow modes
        FLOW_OUT: FLOW_OUT,
        FLOW_IN:  FLOW_IN,

        tokens: {
            LCurly:                     LCurly,
            RCurly:                     RCurly,
            LSquare:                    LSquare,
            RSquare:                    RSquare,
            Comma:                      Comma,
            DashDashDash:               DashDashDash,
            DotDotDot:                  DotDotDot,
            ColonSpace:                 ColonSpace,
            QuestionSpace:              QuestionSpace,
            DashSpace:                  DashSpace,
            INDENT:                     INDENT,
            DEDENT:                     DEDENT,
            SAME_INDENT:                SAME_INDENT,
            Tag:                        Tag,
            AnchorDef:                  AnchorDef,
            AnchorRef:                  AnchorRef,
            WhiteSpace:                 SeparationSpaces,
            LineBreak:                  LineBreak,
            PlainScalar:                PlainScalar,
            SingleQuoteScalar:          SingleQuoteScalar,
            SingleQuoteMultiLineScalar: SingleQuoteMultiLineScalar,
            DoubleQuoteScalar:          DoubleQuoteScalar,
            DoubleQuoteMultilineScalar: DoubleQuoteMultilineScalar
        }

    }
}))
