(function(mod) {
  if (typeof exports == "object" && typeof module == "object") return mod(exports); // CommonJS
  if (typeof define == "function" && define.amd) return define(["exports"], mod); // AMD
  mod(this.ScanJS || (this.ScanJS = {})); // Plain browser env
})(function(exports) {
  var ScanJS = {
    template : {
      identifier : "var node=arguments[0]; return node.type == 'Identifier' && node.name == '$1$';",
      member : "var node=arguments[0]; return node.type == 'MemberExpression' && node.property.name == '$1$';",
      literal : "var node=arguments[0]; return node.type == 'Literal' && node.value == '$1$';",
      call : "var node=arguments[0]; return node.type == 'CallExpression' && node.callee.name == '$1$';",
      memberCall : "var node=arguments[0]; return node.type == 'CallExpression' &&" + "node.callee.type == 'MemberExpression' &&" + "node.callee.object.name=='$1$' && " + "node.callee.property.name=='$2$';",
      generate : function(rule) {

        // ScanJS supports the following rule types. To search for a:
        // identifier: just use plain words e.g. foo
        // member:  prefix identifier with a . e.g. .foo
        // literal: wrap  in single quotes e.g. 'foo'
        // call: append () e.g. foo()
        // memberCall: write as foo.bar()
        // function: start rule with function()
        var type = ''
        var body;
        if(rule[0] == '\'' || rule[0] == '"') {
          type = 'literal'
          rule = rule.replace('\'', '').replace('\"', '');
          body = this[type].replace('$1$', rule)
        } else if(rule[0] == '.') {
          type = 'member'
          rule = rule.replace('.', '');
          body = this[type].replace('$1$', rule)
        } else if(rule.match(/\..*\(\)/)) {
          type = 'memberCall';
          rule1 = rule.split('.')[0];
          rule2 = rule.split('.')[1].replace('()', '');
          body = this[type].replace('$1$', rule1).replace('$2$', rule2)
        } else if(rule.match(/\(\)/)) {
          type = 'call';
          rule = rule.replace("()", "");
          body = this[type].replace('$1$', rule)
        } else {
          //todo check for valid identifier
          type = 'identifier';
          body = this[type].replace('$1$', rule)
        }
        return new Function(body);
      }
    },
    traverse : function(object, visitor) {
      var key, child;

      if(visitor.call(null, object) === false) {
        return;
      }
      for(key in object) {
        //if(object.hasOwnProperty(key)) {
        // using func from obj.proto because this obj might have wrong prototype :<
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          child = object[key];
          if( typeof child === 'object' && child !== null) {
            ScanJS.traverse(child, visitor);
          }
        }
      }
    },
    scan : function(content, signatures, filename, copiedname) {
      //console.log(content);
      //console.log(signatures);
      if (typeof this.th === "undefined") {
        // init. dirty :<<
        function getFileFromDict(th, name, cb) {
          var text = th.fileDict[name];
          if (text)
            cb(text);
          //else if (ts.options.getFile)
          //  ts.options.getFile(name, c);
          else
            cb(null);
        }
        function ternHandler() {
          //  this and most other functions adopted/stolen from tern's codemirror glue
          this.addFile = function(name, text) {
            this.fileDict[name] = text;
            this.ternServer.addFile(name, text)
          };
          var self = this;
          this.fileDict = {}; // used as a cache..

          this.ternServer = new tern.Server({async: true, plugins: {},
            getFile: function(name, cb) {
              return getFileFromDict(self, name, cb)
            },
            defs: [defs.browser], // [JSON.parse(defs)]
          });
          this.getType = function(file, pos, cb) {
            this.ternServer.request({
                "query": {
                  "type": "type",
                  "lineCharPositions":true,
                  "end": { "line": 0, "ch": pos}, // yay.. :D
                  "file": file
                },
                "files": []},
              cb);
          }
          // return this;
        };
        /*ternHandler.prototype.getType = function(file, pos, cb) {
         this.ternServer.request({
         "query": {
         "type": "type",
         "lineCharPositions":true,
         "end": { "line": 0, "ch": pos}, // yay.. :D
         "file": file
         },
         "files": []},
         cb);
         } */
        this.th = new ternHandler();
      }
      var scanresults = {};
      this.testNumber = 0;
      this.testTotal = signatures.length;
      if(this.Total <= 0) {
        console.log('Error: signatures array is 0 length')
        return;
      }
      if (content.indexOf("#!") == 0) {
        /* hash-bang not so uncommin in nodejs files, cut off first line
         * to avoid parse failures */
        content = content.slice(content.indexOf("\n"+1));
      }
      try {
        ast = acorn.parse(content, {
          locations : true
        });
      }
      catch(e) {
        console.log("ERROR: Skipping " + filename +" (parsing failure)");
        console.log('Exception: '+e+ "\n");
        throw e;
      }

      //run all the rules against content.

      console.log('Running tests against ' + filename);
      for (var key in signatures) {
        this.testNumber++; // ??
        var rule = signatures[key];
        scanresults[rule.name] = [];
        var testFunc;
        if(rule.test.match(/^function/)) {
          testFunc = eval("(" + rule.test + ")");
        } else {
          testFunc = ScanJS.template.generate(rule.test);
        }

        ScanJS.traverse(ast, function(node) {
          var result = testFunc.call(this, node);
          if(result) {
            scanresults[rule.name].push({
              rule : rule,
              filename : filename,
              copiedname : filename,
              line : node.loc.start.line,
              col : node.loc.start.col,
              node : node
            });
          }
        });
        if (scanresults[rule.name].length == 0) {
          delete scanresults[rule.name]; // no need to store empty arrays
        }
      }
      console.log(filename + ' had matches for ' + Object.keys(scanresults).length + ' rules.');
      return scanresults;
    },
    getBlocks: function(ast) {
      var branchTypes = ["BreakStatement", "ContinueStatement", "IfStatement", "SwitchStatement", "ReturnStatement", "ThrowStatement", "TryStatement", "WhileStatement", "DoWhileStatement", "ForStatement", "ForInStatement", "ForOfStatement"];
      var blocks = [""]; // list of objects
      ScanJS.traverse(ast, function(node) {
        if (!node.hasOwnProperty('type')) { return false; } // don't go deeper
        console.log(node.type);
        if (node.type.indexOf("Statement") == -1) { return false; } // just skip?!
        if (branchTypes.indexOf(node.type) !== -1) {
          blocks.push(""); // next block
        }
        try {
          var code = escodegen.generate(node)
        }
        catch(e) {
          console.log("escodegen error " +e + "typeof blocks:" + JSON.stringify(blocks));
          console.log(JSON.stringify(node));
        }
        blocks[blocks.length-1] += code;
      });
      return blocks
    }
  }

  exports.scan = ScanJS.scan;
  exports.traverse = ScanJS.traverse;
});