import {gast} from "../../../src/parse/grammar/gast_public"
import {IdentTok, EntityTok, actionDec, CommaTok, RParenTok, SemicolonTok} from "./samples"
import {
    buildInProdFollowPrefix,
    buildBetweenProdsFollowPrefix,
    ResyncFollowsWalker,
    computeAllProdsFollows
} from "../../../src/parse/grammar/follow"
import {setEquality} from "../../utils/matchers"

let Rule = gast.Rule
let Terminal = gast.Terminal

describe("The Grammar Ast Follows model", () => {

    it("can build a followNamePrefix from a Terminal", () => {
        let terminal = new Terminal(IdentTok)
        let actual = buildInProdFollowPrefix(terminal)
        expect(actual).to.equal("IdentTok1_~IN~_")

        let terminal2 = new Terminal(EntityTok)
        terminal2.occurrenceInParent = 3
        let actual2 = buildInProdFollowPrefix(terminal2)
        expect(actual2).to.equal("EntityTok3_~IN~_")
    })

    it("can build a followName prefix from a TopLevel Production and index", () => {
        let prod = new Rule("bamba", [])
        let index = 5

        let actual = buildBetweenProdsFollowPrefix(prod, index)
        expect(actual).to.equal("bamba5_~IN~_")
    })

    it("can compute the follows for Top level production ref in ActionDec", () => {
        let actual:any = new ResyncFollowsWalker(actionDec).startWalking()
        let actualFollowNames = actual.keys()
        expect(actualFollowNames.length).to.equal(3)
        expect(actual.get("paramSpec1_~IN~_actionDec").length).to.equal(2)
        setEquality(actual.get("paramSpec1_~IN~_actionDec"), [CommaTok, RParenTok])
        expect(actual.get("paramSpec2_~IN~_actionDec").length).to.equal(2)
        setEquality(actual.get("paramSpec1_~IN~_actionDec"), [CommaTok, RParenTok])
        expect(actual.get("qualifiedName1_~IN~_actionDec").length).to.equal(1)
        setEquality(actual.get("qualifiedName1_~IN~_actionDec"), [SemicolonTok])
    })

    it("can compute all follows for a set of top level productions", () => {
        let actual = computeAllProdsFollows([actionDec])
        expect(actual.keys().length).to.equal(3)
    })

})
