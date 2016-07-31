
* [Directives](http://yaml.org/spec/1.2/spec.html#id2781147)

* Tags

* Aliases

* Implicit Keys.
  * requires backtracking
  * 1024 chars max lookahead
    * JS-YAML does not enforce the 1024 chars rule.
  * ColonSpace has special rules similar to DashSpace (but more complex..)
    * http://yaml.org/spec/1.2/spec.html#id2790832
    * http://yaml.org/spec/1.2/spec.html#ns-plain-safe(c)
    * Implicit Flow key --> can be followed by whitespace and flow indicators
    * Implict Block key --> can be followed by whitespace.


* support LA > 1 (for example in **blockSequence** rule).
  * this means lexer modes can't be switched while "inside" lookahead.
  * can be implemented in an ineffective (performance wise)
    way by not saving the change in the state of the lexer are looking ahead...

* support multiline scalars

* support plain scalars

* comments

* enable error recovery:
  * SKIP_TOKEN must be implemented.
  * in parser_public.ts NEXT_TOKEN and LA(1) (peeking) should be distinguished
    because when using a custom lexer which is dependent on parser context, NEXT_TOKEN will change the state of the lexer.
  * The Lexer modes state controlled by the Parser can become messed up during recovery. as not all the code of a rule will execute.
    * need to support custom actions in the custom's rule 'finally' clause for this.
    * Not sure its worth the trouble... maybe the error recovery for the yaml use case should be limited inside
      the same sub context... there is a limit to what can be reasonably achieved when working with such a spec...

* When scanning Scalars there must be a guarantee that the loop will terminate. otherwise we shall encounter infinite loops.
  at most we can scan until the end of the text input...

* support '?' indicator
    **8.2.2. Block Mappings**
    If the “?” indicator is specified,
    the optional value node must be specified on a separate line, denoted by the “:” indicator.
    Note that YAML allows here the same compact in-line notation described above for block sequence entries.

  * **Example 8.17. Explicit Block Mapping Entries**
    If the “?” indicator is omitted, parsing needs to see past the implicit key,
    in the same way as in the single key: value pair flow mapping.
    Hence, such keys are subject to the same restrictions;
    they are limited to a single line and must not span more than 1024 Unicode characters.

  * **Example 7.15. Flow Mappings**
    If the optional “?” mapping key indicator is specified,
    the rest of the entry may be completely empty.



* support set style flow {1,2,3} ???

* The “-”, “?” and “:” characters used to denote block collection entries
  are perceived by people to be part of the indentation.
  This is handled on a case-by-case basis by the relevant productions.

* 8.1.1.1. Block Indentation Indicator

* The entry node may be either completely empty, be a nested block node,
  or use a compact in-line notation. The compact notation may be used when the
  entry is itself a nested block collection. In this case,
  both the “-” indicator and the following spaces are considered to be part of
  the indentation of the nested collection.
  Note that it is not possible to specify node properties for such a collection.


  ( s-indent(m)
      ( ns-l-compact-sequence(n+1+m)
      | ns-l-compact-mapping(n+1+m) ) )
  | s-l+block-node(n,c)
  | ( e-node s-l-comments )