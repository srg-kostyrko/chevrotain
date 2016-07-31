* '---' without following line break, is it legal?
  it counts as indentation spaces...
  ```
      --- ? bamba : 666
          ? bisli : 333
  ```
  * in JS-YAML it is legal

  * The Spec [says](http://yaml.org/spec/1.2/spec.html#id2777534)
    ```indentation is defined as a zero or more space characters at **the start of a line**.```
    So in this case '---' should **not** count as indentation.


