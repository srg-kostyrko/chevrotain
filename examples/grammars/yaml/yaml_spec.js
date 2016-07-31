describe('The YAML Grammar - ES6 syntax', function() {

    var parseYaml = require("./yaml_parser").parseYaml;

    context("Block Mode", () => {

        it('can parse a flat sequence with "---"', () => {
            var input =
                `---\n` +
                `- 'name'\n` +
                `- 'age'\n` +
                `- 'address'`

            parseYaml(input)
        })

        it('can parse a simple flat sequence', () => {
            var input =
                `- 'name'\n` +
                `- 'age'\n` +
                `- 'address'`

            parseYaml(input)
        })

        it('can parse a flat mapping with "---"', () => {
            var input =
                `---\n` +
                `'name' : 'bamba'\n` +
                `'age'  : '666'\n` +
                `'address'  : 'hell'\n`

            parseYaml(input)
        })

        it('can parse a flat mapping', () => {
            var input =
                `'name' : 'bamba'\n` +
                `'age'  : '666'\n` +
                `'address'  : 'hell'\n`

            parseYaml(input)
        })

        it('can parse a nested mapping', () => {
            var input =
                `'top1' : \n` +
                `   'nested1'  : '1.1'\n` +
                `   'nested2'  : '1.2'\n` +
                `'top2'  : '2'\n`

            parseYaml(input)
        })

        it('can parse a nested sequence', () => {
            var input =
                `- \n` +
                `   - '1.1'\n` +
                `   - '1.2'\n` +
                `- '2'\n`

            parseYaml(input)
        })
    })


    context("Flow Mode", () => {

        it('can parse a flat sequence with "---"', () => {
            var input =
                `---\n` +
                `['name', 'age'\n` +
                `,'address']`

            parseYaml(input)
        })

        it('can parse a simple flat sequence', () => {
            var input =
                `['name', 'age', 'address']\n`

            parseYaml(input)
        })

        it('can parse a flat mapping with "---"', () => {
            var input =
                `---\n` +
                `{\n` +
                `  'age'  : '1',\n` +
                `  'name'  : '2',\n` +
                `  'address'  : '3'\n` +
                `}\n`

            parseYaml(input)
        })

        it('can parse a flat mapping', () => {
            var input =
                `{\n` +
                `  'age'  : '1',\n` +
                `  'name'  : '2',\n` +
                `  'address'  : '3'\n` +
                `}\n`

            parseYaml(input)
        })

        it('can parse a nested mapping', () => {
            var input =
                `{\n` +
                `  'age'  : '1',\n` +
                `  'name'  : { 'nestedKey1': 'nestedValue1'},\n` +
                `  'address'  : '3'\n` +
                `}\n`

            parseYaml(input)
        })

        it('can parse a nested sequence', () => {
            var input =
                `['name', 'age', \n` +
                `['a', 'b', 'c'],\n` +
                `'address']\n`

            parseYaml(input)
        })
    })


    context("Mixed Modes", () => {

        it('can parse a flow mode in a block mode', () => {
            var input =
                `---\n` +
                `- 'name'\n` +
                `- ['1', '2', '2']\n` +
                `- 'address'`

            parseYaml(input)
        })

        it('can parse a flow mode in a nested block mode', () => {
            var input =
                `'top1' : \n` +
                `   'nested1'  : '1.1'\n` +
                `   'nested2'  : { 'a' : '1', 'b' : '2'}\n` +
                `'top2'  : '2'\n`

            parseYaml(input)
        })

        it('can parse a flow mode (both sequence and mapping) in a nested block mode', () => {
            var input =
                `'top1' : \n` +
                `   'nested1'  : '1.1'\n` +
                `   'nested2'  : { 'a' : '1', 'b' : '2'}\n` +
                `   'nested2'  : [ '1', '2', '3']\n` +
                `'top2'  : '2'\n`

            parseYaml(input)
        })

        it('can parse flow mode inside mapping which is inside sequence', () => {
            var input =
                `---\n` +
                `- 'name'\n` +
                `- \n` +
                `  'nested1' : '1'\n` +
                `  'nested2' : ['1','2','3']\n` +
                `  'nested3' : '3'\n` +
                `- 'address'`

            parseYaml(input)
        })
    })

    context("Edge Cases", () => {

        context("ColonSpace handling", () => {

            it("A Colon can be followed by a flow indicator in flow-in context", () => {
                var input =
                    `---\n` +
                    `- 'name'\n` +
                    `- ['1', {'a':}, '2']\n` +
                    `- 'address'`

                parseYaml(input)
            })

            it("A Colon cannot be followed by a flow indicator in flow-out context", () => {
                var input =
                    `---\n` +
                    `- 'name'\n` +
                    `- {'a':}\n` +
                    `- 'address'`

                expect(() => parseYaml(input)).to.throw("A colon must be followed by a space character")
            })
        })

        context("empty flow sequences", () => {

            it("A flow sequence may be completely empty", () => {
                var input = `[]`

                parseYaml(input)
            })

            it("may only contain a single comma", () => {
                var input = `[,]`

                parseYaml(input)
            })

            it("may contain multiple commas", () => {
                var input = `[,,,,]`

                parseYaml(input)
            })

            it("may contain a dangling comma", () => {
                var input = `['1', '2',]`

                parseYaml(input)
            })

            it("may contain a mix of values and empty values", () => {
                var input = `['1', ,,, '2',]`

                parseYaml(input)
            })
        })
    })
})
