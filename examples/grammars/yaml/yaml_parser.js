// wrapping in UMD to allow code to work both in node.js (the tests/specs)
// and in the browser (css_diagrams.html)
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require('chevrotain'), require("lodash"), require("./yaml_lexer"));
    } else {
        // Browser globals (root is window)\
        root["YamlParser"] = factory(root.chevrotain, root._, root.lexerModule).YamlParser;
    }
}(this, function(chevrotain, _, lexerModule) {
    "use strict"

    // Consts and Tokens
    var Parser = chevrotain.Parser
    var YamlLexer = lexerModule.YamlLexer

    const BLOCK = lexerModule.BLOCK
    const FLOW = lexerModule.FLOW
    const PREFIX = lexerModule.PREFIX
    const FLOW_IN = lexerModule.FLOW_IN
    const FLOW_OUT = lexerModule.FLOW_OUT

    var tokens = lexerModule.tokens

    var LCurly = tokens.LCurly
    var RCurly = tokens.RCurly
    var LSquare = tokens.LSquare
    var RSquare = tokens.RSquare
    var Comma = tokens.Comma
    var DashDashDash = tokens.DashDashDash
    var DotDotDot = tokens.DotDotDot
    var ColonSpace = tokens.ColonSpace
    var QuestionSpace = tokens.QuestionSpace
    var DashSpace = tokens.DashSpace
    var INDENT = tokens.INDENT
    var DEDENT = tokens.DEDENT
    var SAME_INDENT = tokens.SAME_INDENT
    var Tag = tokens.Tag
    var AnchorDef = tokens.AnchorDef
    var AnchorRef = tokens.AnchorRef
    var WhiteSpace = tokens.WhiteSpace
    var LineBreak = tokens.LineBreak
    var PlainScalar = tokens.PlainScalar
    var SingleQuoteScalar = tokens.SingleQuoteScalar
    var SingleQuoteMultiLineScalar = tokens.SingleQuoteMultiLineScalar
    var DoubleQuoteScalar = tokens.DoubleQuoteScalar
    var DoubleQuoteMultilineScalar = tokens.DoubleQuoteMultilineScalar

    // ----------------- parser -----------------
    class YamlParser extends Parser {
        // invoke super constructor
        constructor(input) {
            super(input, _.values(tokens), {
                recoveryEnabled: false,
                maxLookahead : 3
            })


            this.lexer = new YamlLexer(input)
            this.indentLevel = -1
            this.lexerMode = PREFIX
            this.flowMode = FLOW_OUT
            this.lastLAToken

            // not mandatory, using <$> (or any other sign) to reduce verbosity (this. this. this. this. .......)
            var $ = this

            this.document = this.RULE("document", function() {
                $.MANY(() => {
                    this.lexerMode = PREFIX
                    // each document has its own indent levels
                    this.indentLevel = -1

                    // TODO: can prefix directive only exist on Nth (n>1) document if a dotdotdot was present ?
                    $.OPTION(()=> {
                        $.CONSUME(DashDashDash)
                    })

                    this.lexerMode = BLOCK
                    // @formatter:off
                $.OR([
                    {ALT: () => {
                        $.CONSUME(INDENT)
                        $.SUBRULE($.flowStyleInBlock)
                    }},
                    {ALT: () => {$.SUBRULE($.blockStyle)}}
                ])
                // @formatter:on

                    $.OPTION2(()=> {
                        $.CONSUME(DotDotDot)
                    })
                })
            })

            this.flowStyle = this.RULE("flowStyle", function() {
                this.lexerMode = FLOW

                $.OR([
                    {ALT: () => {$.SUBRULE($.flowMapping)}},
                    {ALT: () => {$.SUBRULE($.flowSequence)}}
                ])
            })

            this.flowStyleInBlock = this.RULE("flowStyleInBlock", function() {
                this.flowMode = FLOW_OUT
                $.SUBRULE($.flowStyle)
                this.lexerMode = BLOCK
            })

            this.flowMapping = this.RULE("flowMapping", function() {
                $.CONSUME(LCurly)

                $.MANY_SEP(Comma, () => {
                    $.SUBRULE($.flowEntry)
                })

                $.OPTION(() => {
                    $.CONSUME(Comma)
                })
                $.CONSUME(RCurly)
            })

            this.flowEntry = this.RULE("flowEntry", function() {
                $.OPTION(function() {
                    $.CONSUME(QuestionSpace)
                })

                $.SUBRULE($.flowKey)
                $.CONSUME(ColonSpace)

                $.OPTION2(function() {
                    $.CONSUME(Tag)
                })

                $.SUBRULE($.flowMappingContents)
            })

            this.flowSequence = this.RULE("flowSequence", function() {
                $.CONSUME(LSquare)

                $.OPTION(() => {
                    $.SUBRULE($.flowSequenceContents)
                })

                $.MANY(() => { // [,]
                    $.CONSUME(Comma)
                    $.SUBRULE2($.flowSequenceContents)
                })

                $.OPTION2(() => {
                    $.CONSUME2(Comma)
                })
                $.CONSUME(RSquare)
            })

            this.flowKey = this.RULE("flowKey", function() {
                // a flow key may not contain multi line scalars
                $.OR([
                    {ALT: () => {$.CONSUME(PlainScalar)}}, // is this also limited to a single line?
                    {ALT: () => {$.CONSUME(SingleQuoteScalar)}},
                    {ALT: () => {$.CONSUME(DoubleQuoteScalar)}}
                ])
            })

            this.flowMappingContents = this.RULE("flowMappingContents", function() {
                var orgFlowMode = this.flowMode

                // @formatter:off
            $.OR([
                {ALT: () => {
                    this.flowMode = FLOW_IN
                    $.SUBRULE($.flowMapping)
                    this.flowMode = orgFlowMode
                }},
                {ALT: () => {
                    this.flowMode = FLOW_IN
                    $.SUBRULE($.flowSequence)
                    this.flowMode = orgFlowMode
                }},
                {ALT: () => {$.CONSUME(PlainScalar)}},
                {ALT: () => {$.CONSUME(DoubleQuoteScalar)}},
                {ALT: () => {$.CONSUME(SingleQuoteScalar)}},
                {ALT: chevrotain.EMPTY_ALT("Null Node's contents")}
            ])
            // @formatter:on
            })

            this.flowSequenceContents = this.RULE("flowSequenceContents", function() {
                var orgFlowMode = this.flowMode
                // @formatter:off
            $.OR([
                {ALT: () => {
                    this.flowMode = FLOW_IN
                    $.SUBRULE($.flowMapping)
                    this.flowMode = orgFlowMode
                }},
                {ALT: () => {$.SUBRULE($.flowEntry)}},
                {ALT: () => {
                    this.flowMode = FLOW_IN
                    $.SUBRULE($.flowSequence)
                    this.flowMode = orgFlowMode
                }},
                {ALT: () => {$.CONSUME(PlainScalar)}},
                {ALT: () => {$.CONSUME(SingleQuoteScalar)}},
                {ALT: () => {$.CONSUME(SingleQuoteMultiLineScalar)}},
                {ALT: () => {$.CONSUME(DoubleQuoteScalar)}},
                {ALT: () => {$.CONSUME(DoubleQuoteMultilineScalar)}},
                {ALT: chevrotain.EMPTY_ALT("Empty Node")}
            ])
            // @formatter:on
            })


            this.blockStyle = this.RULE("blockStyle", function() {
                $.CONSUME(INDENT)

                $.OR([
                    {ALT: () => { $.SUBRULE($.blockSequence) }},
                    {ALT: () => { $.SUBRULE($.blockMapping) }}
                ])

                $.OR2([
                    {ALT: () => { $.CONSUME(DEDENT) }},
                    {WHEN: isAtEndOfDocument, THEN_DO: chevrotain.EMPTY_ALT}
                ])
            })

            this.blockSequence = this.RULE("blockSequence", function() {
                $.SUBRULE($.blockSequenceItem)
                $.MANY(() => {
                    $.CONSUME(SAME_INDENT)
                    $.SUBRULE2($.blockSequenceItem)
                })
            })

            this.blockSequenceItem = this.RULE("blockSequenceItem", function() {
                $.CONSUME(DashSpace)
                // @formatter:off
            $.OR([
                {ALT: () => {
                    $.CONSUME2(INDENT)
                    $.SUBRULE($.flowStyleInBlock)
                }},
                {ALT: () => { $.SUBRULE2($.blockStyleScalar) }},
                {ALT: () => {
                    $.SUBRULE2($.flowStyleInBlock)
                }},
                {ALT: () => { $.SUBRULE($.blockStyle) }},
                // prefix of the previous alternative, must appear after it.
                {ALT: () => {
                    // ? key1 : 666 # the scalar appears in the same line, no indention needed.
                    // ? key2 : # the scalar appears in the following line so it must be indented.
                    //    666
                    $.CONSUME(INDENT)
                    $.SUBRULE($.blockStyleScalar)
                }}
            ])
            // @formatter:on
            })

            this.blockMapping = this.RULE("blockMapping", function() {
                $.SUBRULE($.blockMappingEntry)
                $.MANY(() => {
                    $.CONSUME(SAME_INDENT)
                    $.SUBRULE2($.blockMappingEntry)
                })
            })

            this.blockMappingEntry = this.RULE("blockMappingEntry", function() {
                // TODO: use BACKTRACK ???
                // TODO: this can be an implicit key too with max size 1024 chars
                $.SUBRULE($.blockKey)
                $.CONSUME(ColonSpace)

                $.OR([
                    {ALT: () => { $.SUBRULE($.blockStyleScalar) }},
                    {ALT: () => { $.SUBRULE($.blockStyle) }},
                    // TODO: can the flow style appear AFTER indent like in a sequence ?
                    {
                        ALT: () => {
                            $.SUBRULE($.flowStyleInBlock)
                        }
                    }
                ])
            })


            this.blockKey = this.RULE("blockKey", function() {
                // a flow key may not contain multi line scalars
                $.OR([
                    {ALT: () => {$.CONSUME(PlainScalar)}}, // is this also limited to a single line?
                    {ALT: () => {$.CONSUME(SingleQuoteScalar)}},
                    {ALT: () => {$.CONSUME(DoubleQuoteScalar)}}
                    // TODO: implicit/complex key?
                ])
            })

            this.blockStyleScalar = this.RULE("blockStyleScalar", function() {
                $.OR([
                    {ALT: () => {$.CONSUME(PlainScalar)}},
                    {ALT: () => {$.CONSUME(SingleQuoteScalar)}},
                    {ALT: () => {$.CONSUME(SingleQuoteMultiLineScalar)}},
                    {ALT: () => {$.CONSUME(DoubleQuoteScalar)}},
                    {ALT: () => {$.CONSUME(DoubleQuoteMultilineScalar)}}
                ])
            })

            // very important to call this after all the rules have been defined.
            // otherwise the parser may not work correctly as it will lack information
            // derived during the self analysis phase.
            Parser.performSelfAnalysis(this)
        }
    }


    YamlParser.prototype.LA = function(howMuch) {
        var laToken = this.lexer.lookahead(howMuch, this.lexerMode, this.indentLevel, this.flowMode)
        // looking ahead and consuming tokens are separate logical steps
        // but we need to remember the lastLAToken so we can update the indent depth on consumption
        this.lastLAToken = laToken
        return laToken
    }

// TODO: remove, for debugging only
    var scannedInput = ""
    YamlParser.prototype.consumeToken = function() {
        // update indentDepth
        // TODO: or BLOCK_OR_PREFIX mode?
        if (this.lexerMode === BLOCK &&
            this.lastLAToken instanceof INDENT ||
            this.lastLAToken instanceof DEDENT) {
            this.indentLevel = this.lastLAToken.image.length
        }

        // TODO: remove, for debugging only
        scannedInput += this.lastLAToken.image + " "
        console.log(scannedInput)

        this.lexer.consumeToken();
    }

    YamlParser.prototype.saveLexerState = function() {
        // TODO: only relevant in recovery
    }

    YamlParser.prototype.restoreLexerState = function() {
        // TODO: only relevant in recovery
    }

    YamlParser.prototype.resetLexerState = function() {
        // TODO: only relevant in flow that reuses the same parser instance
    }

    function isAtEndOfDocument() {
        let nextToken = this.LA(1)
        return nextToken instanceof chevrotain.EOF ||
            nextToken instanceof DotDotDot ||
            nextToken instanceof DashDashDash
    }


    return {
        YamlParser: YamlParser,

        parseYaml: function parseYaml(text) {

            var parser = new YamlParser(text)
            parser.document()

            if (parser.errors.length > 0) {
                throw Error("sad sad panda, parsing errors found -->" + parser.errors[0].message)
            }
        }
    }

}));

