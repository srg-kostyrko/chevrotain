
var _ = require("lodash")
const {EOF, Lexer, Parser, Token} = require('./lib/src/api')

class COMMA extends Token {}
COMMA.PATTERN = /\,/;

class DOT extends Token {}
DOT.PATTERN = /\./;

class DOT_DOT extends Token {}
DOT_DOT.PATTERN = /\.\./;

class EQUALS extends Token {}
EQUALS.PATTERN = /\=/;

class FOR extends Token {}
FOR.PATTERN = /\bfor\b/;

class IDENTIFIER extends Token {}
IDENTIFIER.PATTERN = /[_\$A-Za-z]\w*/;

class IN extends Token {}
IN.PATTERN = /\bin\b/;

class LEFT_CURLY extends Token {}
LEFT_CURLY.PATTERN = /\{/;

class LEFT_ROUND extends Token {}
LEFT_ROUND.PATTERN = /\(/;

class LEFT_SQUARE extends Token {}
LEFT_SQUARE.PATTERN = /\[/;

class MINUS extends Token {}
MINUS.PATTERN = /-/;

class NEWLINE extends Token {}
NEWLINE.PATTERN = /\r?\n/;

class NUMBER_BINARY extends Token {}
NUMBER_BINARY.PATTERN = /0b[_0-1]+[a-zA-Z]*/;

class NUMBER_DECIMAL extends Token {}
NUMBER_DECIMAL.PATTERN = /[0-9][_0-9]*(?:\.[_0-9]+)?[a-zA-Z]*/;

class NUMBER_HEX extends Token {}
NUMBER_HEX.PATTERN = /0x[_0-9a-fA-F]+[a-zA-Z]*/;

class NUMBER_OCTAL extends Token {}
NUMBER_OCTAL.PATTERN = /0o[_0-8]+[a-zA-Z]*/;

class NUMBER_RADIX extends Token {}
NUMBER_RADIX.PATTERN = /(?:[0-9]|[1-2][0-9]|3[0-6])r[_0-9a-zA-Z]+/;

class PLUS extends Token {}
PLUS.PATTERN = /\+/;

class REGEXP extends Token {}
REGEXP.PATTERN = /\/.+\//;

class RIGHT_CURLY extends Token {}
RIGHT_CURLY.PATTERN = /\}/;

class RIGHT_ROUND extends Token {}
RIGHT_ROUND.PATTERN = /\)/;

class RIGHT_SQUARE extends Token {}
RIGHT_SQUARE.PATTERN = /\]/;

class STRING extends Token {}
STRING.PATTERN = /\'([^\\']|\\.)*\'|\"([^\\"]|\\.)*\"/;

class WHITESPACE extends Token {}
WHITESPACE.PATTERN = /[^\r\n\S]+/;
WHITESPACE.GROUP = Lexer.SKIPPED;

const tokens = {
	modes: {
		default: [
			WHITESPACE,
			REGEXP,
			FOR,
			IN,
			COMMA,
			DOT_DOT,
			DOT,
			EQUALS,
			LEFT_CURLY,
			LEFT_ROUND,
			LEFT_SQUARE,
			RIGHT_CURLY,
			RIGHT_ROUND,
			RIGHT_SQUARE,
			MINUS,
			PLUS,
			NEWLINE,
			IDENTIFIER,
			NUMBER_BINARY,
			NUMBER_OCTAL,
			NUMBER_HEX,
			NUMBER_RADIX,
			NUMBER_DECIMAL,
			STRING
		]
	},
	defaultMode: 'default'
};

const lexer = new Lexer(tokens, {
	positionTracking: 'onlyOffset'
});

class TestParser extends Parser {
	constructor() {
		super([], tokens, {
            maxLookahead : 2,
			outputCst: true
		});

		const $ = this;

		$.RULE('Array', function() { // {{{
			$.CONSUME(LEFT_SQUARE);

			$.OR([
				{
					ALT: function() {
						$.SUBRULE($.Operand);

						$.CONSUME(DOT_DOT);

						$.SUBRULE2($.Operand);
					}
				},
				{
					ALT: function() {
						$.SUBRULE($.NL_0M);

						$.SUBRULE($.Expression);

						$.OPTION(function() {
							$.SUBRULE($.ArrayNext);
						})

						$.SUBRULE2($.NL_0M);
					}
				}
			]);
			/* $.OR([
				{
					ALT: function() {
						$.SUBRULE($.NL_1M);

						$.SUBRULE($.Expression);

						$.OPTION5(function() {
							$.SUBRULE($.ArrayNext);
						});

						$.SUBRULE2($.NL_0M);
					}
				},
				{
					ALT: function() {
						$.SUBRULE($.Operand);

						$.OR2([
							{
								ALT: function() {
									$.CONSUME(DOT_DOT);

									$.SUBRULE2($.Operand);
								}
							},
							{
								ALT: function() {
									$.OPTION4(function() {
										$.SUBRULE2($.ArrayNext);
									});

									$.SUBRULE3($.NL_0M);
								}
							}
						]);
					}
				}
			]); */

			$.CONSUME(RIGHT_SQUARE);
		}); // }}}

		$.RULE('ArrayNext', function() { // {{{
			$.OR([
				{
					ALT: function() {
						$.AT_LEAST_ONE(function() {
							$.OR2([
								{
									ALT: function() {
										$.SUBRULE2($.NL_0M);

										$.CONSUME(COMMA);

										$.SUBRULE3($.NL_0M);
									}
								},
								{
									ALT: function() {
										$.SUBRULE($.NL_1M);
									}
								}
							]);

							$.SUBRULE($.Expression);
						});
					}
				},
				{
					ALT: function() {
						$.SUBRULE($.NL_0M);

						$.SUBRULE($.ForExpression);
					}
				}
			]);
		}); // }}}

		$.RULE('Expression', function() { // {{{
			$.OR([
				{
					ALT: function() {
						$.SUBRULE($.Operand);

						$.MANY(function() {
							$.SUBRULE($.Operator);

							$.SUBRULE2($.Operand);
						});
					}
				}
			]);
		}); // }}}

		$.RULE('ForExpression', function() { // {{{
			$.CONSUME(FOR);

			$.OR([
				{
					ALT: function() {
						$.CONSUME(IDENTIFIER);

						$.OPTION(function() {
							$.CONSUME(COMMA);

							$.CONSUME2(IDENTIFIER);
						});
					}
				}
			]);

			$.SUBRULE($.NL_0M);

			$.CONSUME(IN);

			$.OR2([
				{
					ALT: function() {
						$.SUBRULE($.Expression);
					}
				}
			]);
		}); // }}}

		$.RULE('NL_0M', function() { // {{{
			$.MANY(function() {
				$.CONSUME(NEWLINE);
			});
		}); // }}}

		$.RULE('NL_1M', function() { // {{{
			$.AT_LEAST_ONE(function() {
				$.CONSUME(NEWLINE);
			});
		}); // }}}

		$.RULE('NL_EOF_1M', function() { // {{{
			$.OR([
				{
					ALT: function() {
						$.AT_LEAST_ONE(function() {
							$.CONSUME(NEWLINE);
						});

						$.OPTION(function() {
							$.CONSUME2(EOF);
						});
					}
				},
				{
					ALT: function() {
						$.CONSUME(EOF);
					}
				}
			]);
		}); // }}}

		$.RULE('Module', function() { // {{{
			$.SUBRULE($.NL_0M);

			$.MANY(function() {
				$.OR([
					{
						ALT: function() {
							$.SUBRULE($.Statement)
						}
					}
				]);
			});

			$.OPTION(function() {
				$.CONSUME(EOF);
			});
		}); // }}}

		$.RULE('Number', function() { // {{{
			$.OR([
				{
					ALT: function() {
						$.CONSUME(NUMBER_BINARY);
					}
				},
				{
					ALT: function() {
						$.CONSUME(NUMBER_OCTAL);
					}
				},
				{
					ALT: function() {
						$.CONSUME(NUMBER_HEX);
					}
				},
				{
					ALT: function() {
						$.CONSUME(NUMBER_RADIX);
					}
				},
				{
					ALT: function() {
						$.CONSUME(NUMBER_DECIMAL);
					}
				}
			]);
		}) // }}}

		$.RULE('Object', function() { // {{{
			$.CONSUME(LEFT_CURLY);

			$.SUBRULE($.NL_0M);

			$.CONSUME(RIGHT_CURLY);
		}); // }}}

		$.RULE('Operand', function() { // {{{
			$.SUBRULE($.OperandElement);

			$.MANY(function() {
				$.OR([
					{
						ALT: function() {
							$.CONSUME(DOT);

							$.CONSUME(IDENTIFIER);
						}
					},
					{
						ALT: function() {
							$.CONSUME(LEFT_SQUARE);

							$.SUBRULE($.Expression);

							$.CONSUME(RIGHT_SQUARE);
						}
					},
					{
						ALT: function() {
							$.CONSUME(LEFT_ROUND);

							$.CONSUME(RIGHT_ROUND);
						}
					}
				]);
			});
		}); // }}}

		$.RULE('OperandElement', function() { // {{{
			$.OR([
				{
					ALT: function() {
						$.SUBRULE($.Array);
					}
				},
				{
					ALT: function() {
						$.CONSUME(IDENTIFIER);
					}
				},
				{
					ALT: function() {
						$.SUBRULE($.Number);
					}
				},
				{
					ALT: function() {
						$.SUBRULE($.Object);
					}
				},
				{
					ALT: function() {
						$.CONSUME(REGEXP);
					}
				},
				{
					ALT: function() {
						$.CONSUME(STRING);
					}
				}
			])
		}); // }}}

		$.RULE('Operator', function() { // {{{
			$.OR([
				{
					ALT: function() {
						$.CONSUME(EQUALS);
					}
				},
				{
					ALT: function() {
						$.CONSUME(MINUS);
					}
				},
				{
					ALT: function() {
						$.CONSUME(PLUS);
					}
				}
			]);
		}); // }}}

		$.RULE('Statement', function() { // {{{
			$.OR([
				{
					ALT: function() {
						$.SUBRULE($.StatementExpression);
					}
				}
			]);
		}); // }}}

		$.RULE('StatementExpression', function() { // {{{
			$.CONSUME(IDENTIFIER);

			$.CONSUME(EQUALS);

			$.SUBRULE($.Array);

			$.OR([
				{
					ALT: function() {
						$.CONSUME(NEWLINE);
					}
				},
				{
					ALT: function() {
						$.CONSUME(EOF);
					}
				}
			]);
			/* $.SUBRULE($.Expression);

			$.SUBRULE($.NL_EOF_1M); */
		}); // }}}

		Parser.performSelfAnalysis(this);
	}
}

var startDev = _.now()
try {
    const parser = new TestParser();
}
catch (e) {
	console.log(e.message)
}
var endDev = _.now()
var total = endDev - startDev

console.log(total)

/* let parser = null

function test(text) {
	console.log('-- testing');
	console.log(text);

	let result = lexer.tokenize(text);
	console.log(result);

	if(result.errors.length > 0) {
		console.log('-- lexing errors detected');

		console.log(result.errors);
	}
	else {
		if(parser == null) {
			parser = new TestParser();
		}

		parser.input = result.tokens;

		let value = parser.Module();

		if(parser.errors.length > 0) {
			console.log('-- parsing errors detected');

			console.log(parser.errors);
			throw new Error("Parsing Errors detected")
		}
		else {
			console.log(value)
		}
	}
}

test('a = [1, 2, 3]');

test('a = [1..2]');

test('a = [value for value in values]'); */
