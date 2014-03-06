defs = {};
// XXX ugly ----v
function getJSON(nme, loc) {
  var x = new XMLHttpRequest();
  x.open("GET", loc, true);
  x.send()
  x.onload = function() {
    defs[nme] = JSON.parse(x.response);
  }
}
getJSON('browser', 'js/lib/tern/defs/browser.json');
getJSON('ecma5', 'js/lib/tern/defs/ecma5.json');
getJSON('jquery', 'js/lib/tern/defs/jquery.json');

var scanjsModule=angular.module('scanjs', ['ui.bootstrap']);
function ScanCtrl($scope, ScanSvc) {
  $scope.codeMirror = undefined;
  $scope.run = function(source, filename) {
    var src = source || $scope.codeMirror.getValue();
    var fName = filename || "inline"
    $scope.results=[];
    ScanSvc.newScan(src, fName);
  }

  $scope.$on('NewResults', function(event, results) {
    if (Object.keys(results).length == 0) {
      $scope.error = "Empty result set (this can also be a good thing, if you test a simple file)";
      return
    }
    $scope.results = results;
    $scope.error = "";
  });
  $scope.$on('ScanError', function(event, exception) {
    $scope.error = exception.name +" at Line "+ exception.loc.line +", Column "+exception.loc.column+ ": " + exception.message;
  });
  
  $scope.filterEmpty = function(item) {
    return (item.length>0)
  }

  $scope.handleFileUpload = function handleFileUpload(fileList) {
    for (var i = 0; i < fileList.length; i++) { // This should really just take 1 file
      var file = fileList[i];
      console.log("File: ", file.name, " Filetype: "+ file.type);
      var jsonType = /(application\/json)/;
      var jsType = /(text\/javascript|application\/javascript|application\/x-javascript)/;
      var curFileType;
      if (file.type.match(jsType)) {
        curFileType = "js"
      } else if (file.type.match(jsonType)) {
        curFileType = "json"
      } else {
        $scope.error = "Error: Unknown file type. Expected JavaScript or JSON.";
        $scope.$apply();
        break;
      }
      var reader = new FileReader();
      reader.onload = function(e) {
        if (curFileType == "json") {
          try {
            var resultObj = JSON.parse(e.target.result);
            ScanSvc.addResults(resultObj);
          } catch(e) { // gotta catch them all
            $scope.error = "Could not parse JSON";
            $scope.$apply();
          }
        } else if (curFileType == "js") {
            // update codemirror content
            $scope.codeMirror.setValue(e.target.result);
            $scope.run(e.target.result, this.filename);
            $scope.$apply();
          }
      };
      reader.onerror = function(e) {
        $scope.error = "Could not read file";
        $scope.$apply();
      }
      reader.filename = file.name;
      reader.readAsText(file);
    }
  }
  $scope.setCursor = function (l, c) {
    // use line-1, because editor lines start at 0?!?!?!?? :D
    $scope.codeMirror.setCursor(l-1, c || 0);
    $scope.codeMirror.focus();
  }
  $scope.getLine = function (n) {
    return $scope.codeMirror.getLine(n);
  }
}

angular.element(document).ready(function() {
  // loading codeMirror requires the textArea
  var initialValue = 'dangerous.innerHTML=document.location;\n' +
    'element[\'innerHTML\']=something+"we can catch calls to literal members;"\n' +
    'var foo=\'innerHTML\';element[foo]="but not dynamically referenced ones"\n' +
    'safe.innerHTML="a static string will never result in dom-based XSS";\n' +
    'doesntFlagFalsePositives="eval(\'alert(1)\')"+"element.innerHTML=danger";';

  var scanCtrlScope = angular.element(document.getElementById("input")).scope();
  scanCtrlScope.codeMirror = new CodeMirror(document.getElementById('codeMirrorDiv'), { mode: 'javascript',
                                            lineNumbers: true, theme: 'mdn-like', value: initialValue,
                                            styleActiveLine: true});
});
