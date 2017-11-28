if (typeof define !== 'function'){
  throw new Error('browser-pug supports only AMD environment');
}

define('pug-assert', function(){
  return function(value, message){
    if (!value) throw new error('ASSERT_FAILED', message);
  };
});

define('pug-token-stream', function(){
  var exports = TokenStream;

  function TokenStream(tokens){
    if (!Array.isArray(tokens)){
      throw new TypeError('tokens must be passed to TokenStream as an array.');
    }
    this._tokens = tokens;
  }

  TokenStream.prototype.lookahead = function(index){
    if (this._tokens.length <= index){
      throw new Error('Cannot read past the end of a stream');
    }
    return this._tokens[index];
  };
  TokenStream.prototype.peek = function(){
    if (this._tokens.length === 0){
      throw new Error('Cannot read past the end of a stream');
    }
    return this._tokens[0];
  };
  TokenStream.prototype.advance = function(){
    if (this._tokens.length === 0){
      throw new Error('Cannot read past the end of a stream');
    }
    return this._tokens.shift();
  };
  TokenStream.prototype.defer = function(token){
    this._tokens.unshift(token);
  };

  return exports;
});

define('pug-character-parser', function(){
  var objIsRegex = function(value){
    if (!value || typeof value !== 'object'){
      return false;
    }
    if (!value.hasOwnProperty('lastIndex'))
      return false;

    return true;
  };


  var exports = parse;

  var TOKEN_TYPES = exports.TOKEN_TYPES = {
    LINE_COMMENT: '//',
    BLOCK_COMMENT: '/**/',
    SINGLE_QUOTE: '\'',
    DOUBLE_QUOTE: '"',
    TEMPLATE_QUOTE: '`',
    REGEXP: '//g'
  }

  var BRACKETS = exports.BRACKETS = {
    '(': ')',
    '{': '}',
    '[': ']'
  };
  var BRACKETS_REVERSED = {
    ')': '(',
    '}': '{',
    ']': '['
  };

  exports.parse = parse;

  function parse(src, state, options){
    options = options || {};
    state = state || exports.defaultState();
    var start = options.start || 0;
    var end = options.end || src.length;
    var index = start;
    while (index < end){
      try {
        parseChar(src[index], state);
      } catch (ex) {
        ex.index = index;
        throw ex;
      }
      index++;
    }
    return state;
  }

  exports.parseUntil = parseUntil;

  function parseUntil(src, delimiter, options){
    options = options || {};
    var start = options.start || 0;
    var index = start;
    var state = exports.defaultState();
    while (index < src.length){
      if ((options.ignoreNesting || !state.isNesting(options)) && matches(src, delimiter, index)){
        var end = index;
        return {
          start: start,
          end: end,
          src: src.substring(start, end)
        };
      }
      try {
        parseChar(src[index], state);
      } catch (ex) {
        ex.index = index;
        throw ex;
      }
      index++;
    }
    var err = new Error('The end of the string was reached with no closing bracket found.');
    err.code = 'CHARACTER_PARSER:END_OF_STRING_REACHED';
    err.index = index;
    throw err;
  }

  exports.parseChar = parseChar;

  function parseChar(character, state){
    if (character.length !== 1){
      var err = new Error('Character must be a string of length 1');
      err.name = 'InvalidArgumentError';
      err.code = 'CHARACTER_PARSER:CHAR_LENGTH_NOT_ONE';
      throw err;
    }
    state = state || exports.defaultState();
    state.src += character;
    var wasComment = state.isComment();
    var lastChar = state.history ? state.history[0] : '';


    if (state.regexpStart){
      if (character === '/' || character == '*'){
        state.stack.pop();
      }
      state.regexpStart = false;
    }
    switch (state.current()){
      case TOKEN_TYPES.LINE_COMMENT:
        if (character === '\n'){
          state.stack.pop();
        }
        break;
      case TOKEN_TYPES.BLOCK_COMMENT:
        if (state.lastChar === '*' && character === '/'){
          state.stack.pop();
        }
        break;
      case TOKEN_TYPES.SINGLE_QUOTE:
        if (character === '\'' && !state.escaped){
          state.stack.pop();
        } else if (character === '\\' && !state.escaped){
          state.escaped = true;
        } else {
          state.escaped = false;
        }
        break;
      case TOKEN_TYPES.DOUBLE_QUOTE:
        if (character === '"' && !state.escaped){
          state.stack.pop();
        } else if (character === '\\' && !state.escaped){
          state.escaped = true;
        } else {
          state.escaped = false;
        }
        break;
      case TOKEN_TYPES.TEMPLATE_QUOTE:
        if (character === '`' && !state.escaped){
          state.stack.pop();
          state.hasDollar = false;
        } else if (character === '\\' && !state.escaped){
          state.escaped = true;
          state.hasDollar = false;
        } else if (character === '$' && !state.escaped){
          state.hasDollar = true;
        } else if (character === '{' && state.hasDollar){
          state.stack.push(BRACKETS[character]);
        } else {
          state.escaped = false;
          state.hasDollar = false;
        }
        break;
      case TOKEN_TYPES.REGEXP:
        if (character === '/' && !state.escaped){
          state.stack.pop();
        } else if (character === '\\' && !state.escaped){
          state.escaped = true;
        } else {
          state.escaped = false;
        }
        break;
      default:
        if (character in BRACKETS){
          state.stack.push(BRACKETS[character]);
        } else if (character in BRACKETS_REVERSED){
          if (state.current() !== character){
            var err = new SyntaxError('Mismatched Bracket: ' + character);
            err.code = 'CHARACTER_PARSER:MISMATCHED_BRACKET';
            throw err;
          }
          ;
          state.stack.pop();
        } else if (lastChar === '/' && character === '/'){
          // Don't include comments in history
          state.history = state.history.substr(1);
          state.stack.push(TOKEN_TYPES.LINE_COMMENT);
        } else if (lastChar === '/' && character === '*'){
          // Don't include comment in history
          state.history = state.history.substr(1);
          state.stack.push(TOKEN_TYPES.BLOCK_COMMENT);
        } else if (character === '/' && isRegexp(state.history)){
          state.stack.push(TOKEN_TYPES.REGEXP);
          // N.B. if the next character turns out to be a `*` or a `/`
          //      then this isn't actually a regexp
          state.regexpStart = true;
        } else if (character === '\''){
          state.stack.push(TOKEN_TYPES.SINGLE_QUOTE);
        } else if (character === '"'){
          state.stack.push(TOKEN_TYPES.DOUBLE_QUOTE);
        } else if (character === '`'){
          state.stack.push(TOKEN_TYPES.TEMPLATE_QUOTE);
        }
        break;
    }
    if (!state.isComment() && !wasComment){
      state.history = character + state.history;
    }
    state.lastChar = character; // store last character for ending block comments
    return state;
  }

  exports.defaultState = function(){
    return new State()
  };

  function State(){
    this.stack = [];

    this.regexpStart = false;
    this.escaped = false;
    this.hasDollar = false;

    this.src = '';
    this.history = ''
    this.lastChar = ''
  }

  State.prototype.current = function(){
    return this.stack[this.stack.length - 1];
  };
  State.prototype.isString = function(){
    return (
      this.current() === TOKEN_TYPES.SINGLE_QUOTE ||
      this.current() === TOKEN_TYPES.DOUBLE_QUOTE ||
      this.current() === TOKEN_TYPES.TEMPLATE_QUOTE
    );
  }
  State.prototype.isComment = function(){
    return this.current() === TOKEN_TYPES.LINE_COMMENT || this.current() === TOKEN_TYPES.BLOCK_COMMENT;
  }
  State.prototype.isNesting = function(opts){
    if (
      opts && opts.ignoreLineComment &&
      this.stack.length === 1 && this.stack[0] === TOKEN_TYPES.LINE_COMMENT
    ){
      // if we are only inside a line comment, and line comments are ignored
      // don't count it as nesting
      return false;
    }
    return !!this.stack.length;
  }

  function matches(str, matcher, i){
    if (objIsRegex(matcher)){
      return matcher.test(str.substr(i || 0));
    } else {
      return str.substr(i || 0, matcher.length) === matcher;
    }
  }

  exports.isPunctuator = isPunctuator

  function isPunctuator(c){
    if (!c) return true; // the start of a string is a punctuator
    var code = c.charCodeAt(0)

    switch (code){
      case 46:   // . dot
      case 40:   // ( open bracket
      case 41:   // ) close bracket
      case 59:   // ; semicolon
      case 44:   // , comma
      case 123:  // { open curly brace
      case 125:  // } close curly brace
      case 91:   // [
      case 93:   // ]
      case 58:   // :
      case 63:   // ?
      case 126:  // ~
      case 37:   // %
      case 38:   // &
      case 42:   // *:
      case 43:   // +
      case 45:   // -
      case 47:   // /
      case 60:   // <
      case 62:   // >
      case 94:   // ^
      case 124:  // |
      case 33:   // !
      case 61:   // =
        return true;
      default:
        return false;
    }
  }

  exports.isKeyword = isKeyword

  function isKeyword(id){
    return (id === 'if') || (id === 'in') || (id === 'do') || (id === 'var') || (id === 'for') || (id === 'new') ||
      (id === 'try') || (id === 'let') || (id === 'this') || (id === 'else') || (id === 'case') ||
      (id === 'void') || (id === 'with') || (id === 'enum') || (id === 'while') || (id === 'break') || (id === 'catch') ||
      (id === 'throw') || (id === 'const') || (id === 'yield') || (id === 'class') || (id === 'super') ||
      (id === 'return') || (id === 'typeof') || (id === 'delete') || (id === 'switch') || (id === 'export') ||
      (id === 'import') || (id === 'default') || (id === 'finally') || (id === 'extends') || (id === 'function') ||
      (id === 'continue') || (id === 'debugger') || (id === 'package') || (id === 'private') || (id === 'interface') ||
      (id === 'instanceof') || (id === 'implements') || (id === 'protected') || (id === 'public') || (id === 'static');
  }

  function isRegexp(history){
    //could be start of regexp or divide sign

    history = history.replace(/^\s*/, '');

    //unless its an `if`, `while`, `for` or `with` it's a divide, so we assume it's a divide
    if (history[0] === ')') return false;
    //unless it's a function expression, it's a regexp, so we assume it's a regexp
    if (history[0] === '}') return true;
    //any punctuation means it's a regexp
    if (isPunctuator(history[0])) return true;
    //if the last thing was a keyword then it must be a regexp (e.g. `typeof /foo/`)
    if (/^\w+\b/.test(history) && isKeyword(/^\w+\b/.exec(history)[0].split('').reverse().join(''))) return true;

    return false;
  };

  return exports;

});

define('pug-lexer', ['pug-character-parser'], function(){
  var isExpression = function(){
    // STUB
    return false;
  };

  var characterParser = require('pug-character-parser');

  var exports = lex;
  exports.Lexer = Lexer;

  function lex(str, options){
    var lexer = new Lexer(str, options);
    return JSON.parse(JSON.stringify(lexer.getTokens()));
  }

  /**
   * Initialize `Lexer` with the given `str`.
   *
   * @param {String} str
   * @param {String} filename
   * @api private
   */

  function Lexer(str, options){
    options = options || {};
    if (typeof str !== 'string'){
      throw new Error('Expected source code to be a string but got "' + (typeof str) + '"')
    }
    if (typeof options !== 'object'){
      throw new Error('Expected "options" to be an object but got "' + (typeof options) + '"')
    }
    //Strip any UTF-8 BOM off of the start of `str`, if it exists.
    str = str.replace(/^\uFEFF/, '');
    this.input = str.replace(/\r\n|\r/g, '\n');
    this.originalInput = this.input;
    this.filename = options.filename;
    this.interpolated = options.interpolated || false;
    this.lineno = options.startingLine || 1;
    this.colno = options.startingColumn || 1;
    this.plugins = options.plugins || [];
    this.indentStack = [0];
    this.indentRe = null;
    // If #{}, !{} or #[] syntax is allowed when adding text
    this.interpolationAllowed = true;

    this.tokens = [];
    this.ended = false;
  };

  /**
   * Lexer prototype.
   */

  Lexer.prototype = {

    constructor: Lexer,

    error: function(code, message){
      var err = new Error(code, message, {line: this.lineno, column: this.colno, filename: this.filename, src: this.originalInput});
      throw err;
    },

    assert: function(value, message){
      if (!value) this.error('ASSERT_FAILED', message);
    },

    isExpression: function(exp){
      return isExpression(exp, {
        throw: true
      });
    },

    assertExpression: function(exp, noThrow){
      //this verifies that a JavaScript expression is valid
      try {
        this.callLexerFunction('isExpression', exp);
        return true;
      } catch (ex) {
        if (noThrow) return false;

        // not coming from acorn
        if (!ex.loc) throw ex;

        this.incrementLine(ex.loc.line - 1);
        this.incrementColumn(ex.loc.column);
        var msg = 'Syntax Error: ' + ex.message.replace(/ \([0-9]+:[0-9]+\)$/, '');
        this.error('SYNTAX_ERROR', msg);
      }
    },

    assertNestingCorrect: function(exp){
      //this verifies that code is properly nested, but allows
      //invalid JavaScript such as the contents of `attributes`
      var res = characterParser(exp);
      if (res.isNesting()){
        this.error('INCORRECT_NESTING', 'Nesting must match on expression `' + exp + '`')
      }
    },

    /**
     * Construct a token with the given `type` and `val`.
     *
     * @param {String} type
     * @param {String} val
     * @return {Object}
     * @api private
     */

    tok: function(type, val){
      var res = {type: type, line: this.lineno, col: this.colno};

      if (val !== undefined) res.val = val;

      return res;
    },

    /**
     * Increment `this.lineno` and reset `this.colno`.
     *
     * @param {Number} increment
     * @api private
     */

    incrementLine: function(increment){
      this.lineno += increment;
      if (increment) this.colno = 1;
    },

    /**
     * Increment `this.colno`.
     *
     * @param {Number} increment
     * @api private
     */

    incrementColumn: function(increment){
      this.colno += increment
    },

    /**
     * Consume the given `len` of input.
     *
     * @param {Number} len
     * @api private
     */

    consume: function(len){
      this.input = this.input.substr(len);
    },

    /**
     * Scan for `type` with the given `regexp`.
     *
     * @param {String} type
     * @param {RegExp} regexp
     * @return {Object}
     * @api private
     */

    scan: function(regexp, type){
      var captures;
      if (captures = regexp.exec(this.input)){
        var len = captures[0].length;
        var val = captures[1];
        var diff = len - (val ? val.length : 0);
        var tok = this.tok(type, val);
        this.consume(len);
        this.incrementColumn(diff);
        return tok;
      }
    },
    scanEndOfLine: function(regexp, type){
      var captures;
      if (captures = regexp.exec(this.input)){
        var whitespaceLength = 0;
        var whitespace;
        var tok;
        if (whitespace = /^([ ]+)([^ ]*)/.exec(captures[0])){
          whitespaceLength = whitespace[1].length;
          this.incrementColumn(whitespaceLength);
        }
        var newInput = this.input.substr(captures[0].length);
        if (newInput[0] === ':'){
          this.input = newInput;
          tok = this.tok(type, captures[1]);
          this.incrementColumn(captures[0].length - whitespaceLength);
          return tok;
        }
        if (/^[ \t]*(\n|$)/.test(newInput)){
          this.input = newInput.substr(/^[ \t]*/.exec(newInput)[0].length);
          tok = this.tok(type, captures[1]);
          this.incrementColumn(captures[0].length - whitespaceLength);
          return tok;
        }
      }
    },

    /**
     * Return the indexOf `(` or `{` or `[` / `)` or `}` or `]` delimiters.
     *
     * Make sure that when calling this function, colno is at the character
     * immediately before the beginning.
     *
     * @return {Number}
     * @api private
     */

    bracketExpression: function(skip){
      skip = skip || 0;
      var start = this.input[skip];
      this.assert(start === '(' || start === '{' || start === '[',
        'The start character should be "(", "{" or "["');
      var end = characterParser.BRACKETS[start];
      var range;
      try {
        range = characterParser.parseUntil(this.input, end, {start: skip + 1});
      } catch (ex) {
        if (ex.index !== undefined){
          var idx = ex.index;
          // starting from this.input[skip]
          var tmp = this.input.substr(skip).indexOf('\n');
          // starting from this.input[0]
          var nextNewline = tmp + skip;
          var ptr = 0;
          while (idx > nextNewline && tmp !== -1){
            this.incrementLine(1);
            idx -= nextNewline + 1;
            ptr += nextNewline + 1;
            tmp = nextNewline = this.input.substr(ptr).indexOf('\n');
          }
          ;

          this.incrementColumn(idx);
        }
        if (ex.code === 'CHARACTER_PARSER:END_OF_STRING_REACHED'){
          this.error('NO_END_BRACKET', 'The end of the string reached with no closing bracket ' + end + ' found.');
        } else if (ex.code === 'CHARACTER_PARSER:MISMATCHED_BRACKET'){
          this.error('BRACKET_MISMATCH', ex.message);
        }
        throw ex;
      }
      return range;
    },

    scanIndentation: function(){
      var captures, re;

      // established regexp
      if (this.indentRe){
        captures = this.indentRe.exec(this.input);
        // determine regexp
      } else {
        // tabs
        re = /^\n(\t*) */;
        captures = re.exec(this.input);

        // spaces
        if (captures && !captures[1].length){
          re = /^\n( *)/;
          captures = re.exec(this.input);
        }

        // established
        if (captures && captures[1].length) this.indentRe = re;
      }

      return captures;
    },

    /**
     * end-of-source.
     */

    eos: function(){
      if (this.input.length) return;
      if (this.interpolated){
        this.error('NO_END_BRACKET', 'End of line was reached with no closing bracket for interpolation.');
      }
      for (var i = 0; this.indentStack[i]; i++){
        this.tokens.push(this.tok('outdent'));
      }
      this.tokens.push(this.tok('eos'));
      this.ended = true;
      return true;
    },

    /**
     * Blank line.
     */

    blank: function(){
      var captures;
      if (captures = /^\n[ \t]*\n/.exec(this.input)){
        this.consume(captures[0].length - 1);
        this.incrementLine(1);
        return true;
      }
    },

    /**
     * Comment.
     */

    comment: function(){
      var captures;
      if (captures = /^\/\/(-)?([^\n]*)/.exec(this.input)){
        this.consume(captures[0].length);
        var tok = this.tok('comment', captures[2]);
        tok.buffer = '-' != captures[1];
        this.interpolationAllowed = tok.buffer;
        this.tokens.push(tok);
        this.incrementColumn(captures[0].length);
        this.callLexerFunction('pipelessText');
        return true;
      }
    },

    /**
     * Interpolated tag.
     */

    interpolation: function(){
      if (/^#\{/.test(this.input)){
        var match = this.bracketExpression(1);
        this.consume(match.end + 1);
        var tok = this.tok('interpolation', match.src);
        this.tokens.push(tok);
        this.incrementColumn(2); // '#{'
        this.assertExpression(match.src);

        var splitted = match.src.split('\n');
        var lines = splitted.length - 1;
        this.incrementLine(lines);
        this.incrementColumn(splitted[lines].length + 1); // + 1 → '}'
        return true;
      }
    },

    /**
     * Tag.
     */

    tag: function(){
      var captures;

      if (captures = /^(\w(?:[-:\w]*\w)?)/.exec(this.input)){
        var tok, name = captures[1], len = captures[0].length;
        this.consume(len);
        tok = this.tok('tag', name);
        this.tokens.push(tok);
        this.incrementColumn(len);
        return true;
      }
    },

    /**
     * Filter.
     */

    filter: function(opts){
      var tok = this.scan(/^:([\w\-]+)/, 'filter');
      var inInclude = opts && opts.inInclude;
      if (tok){
        this.tokens.push(tok);
        this.incrementColumn(tok.val.length);
        this.callLexerFunction('attrs');
        if (!inInclude){
          this.interpolationAllowed = false;
          this.callLexerFunction('pipelessText');
        }
        return true;
      }
    },

    /**
     * Doctype.
     */

    doctype: function(){
      var node = this.scanEndOfLine(/^doctype *([^\n]*)/, 'doctype');
      if (node){
        this.tokens.push(node);
        return true;
      }
    },

    /**
     * Id.
     */

    id: function(){
      var tok = this.scan(/^#([\w-]+)/, 'id');
      if (tok){
        this.tokens.push(tok);
        this.incrementColumn(tok.val.length);
        return true;
      }
      if (/^#/.test(this.input)){
        this.error('INVALID_ID', '"' + /.[^ \t\(\#\.\:]*/.exec(this.input.substr(1))[0] + '" is not a valid ID.');
      }
    },

    /**
     * Class.
     */

    className: function(){
      var tok = this.scan(/^\.(-?-?[_a-z][_a-z0-9\-]*)/i, 'class');
      if (tok){
        this.tokens.push(tok);
        this.incrementColumn(tok.val.length);
        return true;
      }
      if (/^\.\-/i.test(this.input)){
        this.error('INVALID_CLASS_NAME', 'If a class name begins with a "-" or "--", it must be followed by a letter or underscore.');
      }
      if (/^\.[0-9]/i.test(this.input)){
        this.error('INVALID_CLASS_NAME', 'Class names must begin with "-", "_" or a letter.');
      }
      if (/^\./.test(this.input)){
        this.error('INVALID_CLASS_NAME', '"' + /.[^ \t\(\#\.\:]*/.exec(this.input.substr(1))[0] + '" is not a valid class name.  Class names must begin with "-", "_" or a letter and can only contain "_", "-", a-z and 0-9.');
      }
    },

    /**
     * Text.
     */
    endInterpolation: function(){
      if (this.interpolated && this.input[0] === ']'){
        this.input = this.input.substr(1);
        this.ended = true;
        return true;
      }
    },
    addText: function(type, value, prefix, escaped){
      if (value + prefix === '') return;
      prefix = prefix || '';
      var indexOfEnd = this.interpolated ? value.indexOf(']') : -1;
      var indexOfStart = this.interpolationAllowed ? value.indexOf('#[') : -1;
      var indexOfEscaped = this.interpolationAllowed ? value.indexOf('\\#[') : -1;
      var matchOfStringInterp = /(\\)?([#!]){((?:.|\n)*)$/.exec(value);
      var indexOfStringInterp = this.interpolationAllowed && matchOfStringInterp ? matchOfStringInterp.index : Infinity;

      if (indexOfEnd === -1) indexOfEnd = Infinity;
      if (indexOfStart === -1) indexOfStart = Infinity;
      if (indexOfEscaped === -1) indexOfEscaped = Infinity;

      if (indexOfEscaped !== Infinity && indexOfEscaped < indexOfEnd && indexOfEscaped < indexOfStart && indexOfEscaped < indexOfStringInterp){
        prefix = prefix + value.substring(0, indexOfEscaped) + '#[';
        return this.addText(type, value.substring(indexOfEscaped + 3), prefix, true);
      }
      if (indexOfStart !== Infinity && indexOfStart < indexOfEnd && indexOfStart < indexOfEscaped && indexOfStart < indexOfStringInterp){
        this.tokens.push(this.tok(type, prefix + value.substring(0, indexOfStart)));
        this.incrementColumn(prefix.length + indexOfStart);
        if (escaped) this.incrementColumn(1);
        this.tokens.push(this.tok('start-pug-interpolation'));
        this.incrementColumn(2);
        var child = new this.constructor(value.substr(indexOfStart + 2), {
          filename: this.filename,
          interpolated: true,
          startingLine: this.lineno,
          startingColumn: this.colno
        });
        var interpolated;
        try {
          interpolated = child.getTokens();
        } catch (ex) {
          if (ex.code && /^PUG:/.test(ex.code)){
            this.colno = ex.column;
            this.error(ex.code.substr(4), ex.msg);
          }
          throw ex;
        }
        this.colno = child.colno;
        this.tokens = this.tokens.concat(interpolated);
        this.tokens.push(this.tok('end-pug-interpolation'));
        this.incrementColumn(1);
        this.addText(type, child.input);
        return;
      }
      if (indexOfEnd !== Infinity && indexOfEnd < indexOfStart && indexOfEnd < indexOfEscaped && indexOfEnd < indexOfStringInterp){
        if (prefix + value.substring(0, indexOfEnd)){
          this.addText(type, value.substring(0, indexOfEnd), prefix);
        }
        this.ended = true;
        this.input = value.substr(value.indexOf(']') + 1) + this.input;
        return;
      }
      if (indexOfStringInterp !== Infinity){
        if (matchOfStringInterp[1]){
          prefix = prefix + value.substring(0, indexOfStringInterp) + '#{';
          return this.addText(type, value.substring(indexOfStringInterp + 3), prefix);
        }
        var before = value.substr(0, indexOfStringInterp);
        if (prefix || before){
          before = prefix + before;
          this.tokens.push(this.tok(type, before));
          this.incrementColumn(before.length);
        }

        var rest = matchOfStringInterp[3];
        var range;
        var tok = this.tok('interpolated-code');
        this.incrementColumn(2);
        try {
          range = characterParser.parseUntil(rest, '}');
        } catch (ex) {
          if (ex.index !== undefined){
            this.incrementColumn(ex.index);
          }
          if (ex.code === 'CHARACTER_PARSER:END_OF_STRING_REACHED'){
            this.error('NO_END_BRACKET', 'End of line was reached with no closing bracket for interpolation.');
          } else if (ex.code === 'CHARACTER_PARSER:MISMATCHED_BRACKET'){
            this.error('BRACKET_MISMATCH', ex.message);
          } else {
            throw ex;
          }
        }
        tok.mustEscape = matchOfStringInterp[2] === '#';
        tok.buffer = true;
        tok.val = range.src;
        this.assertExpression(range.src);
        this.tokens.push(tok);

        if (range.end + 1 < rest.length){
          rest = rest.substr(range.end + 1);
          this.incrementColumn(range.end + 1);
          this.addText(type, rest);
        } else {
          this.incrementColumn(rest.length);
        }
        return;
      }

      value = prefix + value;
      this.tokens.push(this.tok(type, value));
      this.incrementColumn(value.length);
    },

    text: function(){
      var tok = this.scan(/^(?:\| ?| )([^\n]+)/, 'text') ||
        this.scan(/^( )/, 'text') ||
        this.scan(/^\|( ?)/, 'text');
      if (tok){
        this.addText('text', tok.val);
        return true;
      }
    },

    textHtml: function(){
      var tok = this.scan(/^(<[^\n]*)/, 'text-html');
      if (tok){
        this.addText('text-html', tok.val);
        return true;
      }
    },

    /**
     * Dot.
     */

    dot: function(){
      var tok;
      if (tok = this.scanEndOfLine(/^\./, 'dot')){
        this.tokens.push(tok);
        this.callLexerFunction('pipelessText');
        return true;
      }
    },

    /**
     * Extends.
     */

    "extends": function(){
      var tok = this.scan(/^extends?(?= |$|\n)/, 'extends');
      if (tok){
        this.tokens.push(tok);
        if (!this.callLexerFunction('path')){
          this.error('NO_EXTENDS_PATH', 'missing path for extends');
        }
        return true;
      }
      if (this.scan(/^extends?\b/)){
        this.error('MALFORMED_EXTENDS', 'malformed extends');
      }
    },

    /**
     * Block prepend.
     */

    prepend: function(){
      var captures;
      if (captures = /^(?:block +)?prepend +([^\n]+)/.exec(this.input)){
        var name = captures[1].trim();
        var comment = '';
        if (name.indexOf('//') !== -1){
          comment = '//' + name.split('//').slice(1).join('//');
          name = name.split('//')[0].trim();
        }
        if (!name) return;
        this.consume(captures[0].length - comment.length);
        var tok = this.tok('block', name);
        tok.mode = 'prepend';
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Block append.
     */

    append: function(){
      var captures;
      if (captures = /^(?:block +)?append +([^\n]+)/.exec(this.input)){
        var name = captures[1].trim();
        var comment = '';
        if (name.indexOf('//') !== -1){
          comment = '//' + name.split('//').slice(1).join('//');
          name = name.split('//')[0].trim();
        }
        if (!name) return;
        this.consume(captures[0].length - comment.length);
        var tok = this.tok('block', name);
        tok.mode = 'append';
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Block.
     */

    block: function(){
      var captures;
      if (captures = /^block +([^\n]+)/.exec(this.input)){
        var name = captures[1].trim();
        var comment = '';
        if (name.indexOf('//') !== -1){
          comment = '//' + name.split('//').slice(1).join('//');
          name = name.split('//')[0].trim();
        }
        if (!name) return;
        this.consume(captures[0].length - comment.length);
        var tok = this.tok('block', name);
        tok.mode = 'replace';
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Mixin Block.
     */

    mixinBlock: function(){
      var tok;
      if (tok = this.scanEndOfLine(/^block/, 'mixin-block')){
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Yield.
     */

    'yield': function(){
      var tok = this.scanEndOfLine(/^yield/, 'yield');
      if (tok){
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Include.
     */

    include: function(){
      var tok = this.scan(/^include(?=:| |$|\n)/, 'include');
      if (tok){
        this.tokens.push(tok);
        while (this.callLexerFunction('filter', {inInclude: true})) ;
        if (!this.callLexerFunction('path')){
          if (/^[^ \n]+/.test(this.input)){
            // if there is more text
            this.fail();
          } else {
            // if not
            this.error('NO_INCLUDE_PATH', 'missing path for include');
          }
        }
        return true;
      }
      if (this.scan(/^include\b/)){
        this.error('MALFORMED_INCLUDE', 'malformed include');
      }
    },

    /**
     * Path
     */

    path: function(){
      var tok = this.scanEndOfLine(/^ ([^\n]+)/, 'path');
      if (tok && (tok.val = tok.val.trim())){
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Case.
     */

    "case": function(){
      var tok = this.scanEndOfLine(/^case +([^\n]+)/, 'case');
      if (tok){
        this.incrementColumn(-tok.val.length);
        this.assertExpression(tok.val);
        this.incrementColumn(tok.val.length);
        this.tokens.push(tok);
        return true;
      }
      if (this.scan(/^case\b/)){
        this.error('NO_CASE_EXPRESSION', 'missing expression for case');
      }
    },

    /**
     * When.
     */

    when: function(){
      var tok = this.scanEndOfLine(/^when +([^:\n]+)/, 'when');
      if (tok){
        var parser = characterParser(tok.val);
        while (parser.isNesting() || parser.isString()){
          var rest = /:([^:\n]+)/.exec(this.input);
          if (!rest) break;

          tok.val += rest[0];
          this.consume(rest[0].length);
          this.incrementColumn(rest[0].length);
          parser = characterParser(tok.val);
        }

        this.incrementColumn(-tok.val.length);
        this.assertExpression(tok.val);
        this.incrementColumn(tok.val.length);
        this.tokens.push(tok);
        return true;
      }
      if (this.scan(/^when\b/)){
        this.error('NO_WHEN_EXPRESSION', 'missing expression for when');
      }
    },

    /**
     * Default.
     */

    "default": function(){
      var tok = this.scanEndOfLine(/^default/, 'default');
      if (tok){
        this.tokens.push(tok);
        return true;
      }
      if (this.scan(/^default\b/)){
        this.error('DEFAULT_WITH_EXPRESSION', 'default should not have an expression');
      }
    },

    /**
     * Call mixin.
     */

    call: function(){

      var tok, captures, increment;
      if (captures = /^\+(\s*)(([-\w]+)|(#\{))/.exec(this.input)){
        // try to consume simple or interpolated call
        if (captures[3]){
          // simple call
          increment = captures[0].length;
          this.consume(increment);
          tok = this.tok('call', captures[3]);
        } else {
          // interpolated call
          var match = this.bracketExpression(2 + captures[1].length);
          increment = match.end + 1;
          this.consume(increment);
          this.assertExpression(match.src);
          tok = this.tok('call', '#{' + match.src + '}');
        }

        this.incrementColumn(increment);

        tok.args = null;
        // Check for args (not attributes)
        if (captures = /^ *\(/.exec(this.input)){
          var range = this.bracketExpression(captures[0].length - 1);
          if (!/^\s*[-\w]+ *=/.test(range.src)){ // not attributes
            this.incrementColumn(1);
            this.consume(range.end + 1);
            tok.args = range.src;
            this.assertExpression('[' + tok.args + ']');
            for (var i = 0; i <= tok.args.length; i++){
              if (tok.args[i] === '\n'){
                this.incrementLine(1);
              } else {
                this.incrementColumn(1);
              }
            }
          }
        }
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Mixin.
     */

    mixin: function(){
      var captures;
      if (captures = /^mixin +([-\w]+)(?: *\((.*)\))? */.exec(this.input)){
        this.consume(captures[0].length);
        var tok = this.tok('mixin', captures[1]);
        tok.args = captures[2] || null;
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * Conditional.
     */

    conditional: function(){
      var captures;
      if (captures = /^(if|unless|else if|else)\b([^\n]*)/.exec(this.input)){
        this.consume(captures[0].length);
        var type = captures[1].replace(/ /g, '-');
        var js = captures[2] && captures[2].trim();
        // type can be "if", "else-if" and "else"
        var tok = this.tok(type, js);
        this.incrementColumn(captures[0].length - js.length);

        switch (type){
          case 'if':
          case 'else-if':
            this.assertExpression(js);
            break;
          case 'unless':
            this.assertExpression(js);
            tok.val = '!(' + js + ')';
            tok.type = 'if';
            break;
          case 'else':
            if (js){
              this.error(
                'ELSE_CONDITION',
                '`else` cannot have a condition, perhaps you meant `else if`'
              );
            }
            break;
        }
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * While.
     */

    "while": function(){
      var captures;
      if (captures = /^while +([^\n]+)/.exec(this.input)){
        this.consume(captures[0].length);
        this.assertExpression(captures[1])
        this.tokens.push(this.tok('while', captures[1]));
        return true;
      }
      if (this.scan(/^while\b/)){
        this.error('NO_WHILE_EXPRESSION', 'missing expression for while');
      }
    },

    /**
     * Each.
     */

    each: function(){
      var captures;
      if (captures = /^(?:each|for) +([a-zA-Z_$][\w$]*)(?: *, *([a-zA-Z_$][\w$]*))? * in *([^\n]+)/.exec(this.input)){
        this.consume(captures[0].length);
        var tok = this.tok('each', captures[1]);
        tok.key = captures[2] || null;
        this.incrementColumn(captures[0].length - captures[3].length);
        this.assertExpression(captures[3])
        tok.code = captures[3];
        this.incrementColumn(captures[3].length);
        this.tokens.push(tok);
        return true;
      }
      if (this.scan(/^(?:each|for)\b/)){
        this.error('MALFORMED_EACH', 'malformed each');
      }
      if (captures = /^- *(?:each|for) +([a-zA-Z_$][\w$]*)(?: *, *([a-zA-Z_$][\w$]*))? +in +([^\n]+)/.exec(this.input)){
        this.error(
          'MALFORMED_EACH',
          'Pug each and for should no longer be prefixed with a dash ("-"). They are pug keywords and not part of JavaScript.'
        );
      }
    },

    /**
     * Code.
     */

    code: function(){
      var captures;
      if (captures = /^(!?=|-)[ \t]*([^\n]+)/.exec(this.input)){
        var flags = captures[1];
        var code = captures[2];
        var shortened = 0;
        if (this.interpolated){
          var parsed;
          try {
            parsed = characterParser.parseUntil(code, ']');
          } catch (err) {
            if (err.index !== undefined){
              this.incrementColumn(captures[0].length - code.length + err.index);
            }
            if (err.code === 'CHARACTER_PARSER:END_OF_STRING_REACHED'){
              this.error('NO_END_BRACKET', 'End of line was reached with no closing bracket for interpolation.');
            } else if (err.code === 'CHARACTER_PARSER:MISMATCHED_BRACKET'){
              this.error('BRACKET_MISMATCH', err.message);
            } else {
              throw err;
            }
          }
          shortened = code.length - parsed.end;
          code = parsed.src;
        }
        var consumed = captures[0].length - shortened;
        this.consume(consumed);
        var tok = this.tok('code', code);
        tok.mustEscape = flags.charAt(0) === '=';
        tok.buffer = flags.charAt(0) === '=' || flags.charAt(1) === '=';

        // p #[!=    abc] hey
        //     ^              original colno
        //     -------------- captures[0]
        //           -------- captures[2]
        //     ------         captures[0] - captures[2]
        //           ^        after colno

        // =   abc
        // ^                  original colno
        // -------            captures[0]
        //     ---            captures[2]
        // ----               captures[0] - captures[2]
        //     ^              after colno
        this.incrementColumn(captures[0].length - captures[2].length);
        if (tok.buffer) this.assertExpression(code);
        this.tokens.push(tok);

        // p #[!=    abc] hey
        //           ^        original colno
        //              ----- shortened
        //           ---      code
        //              ^     after colno

        // =   abc
        //     ^              original colno
        //                    shortened
        //     ---            code
        //        ^           after colno
        this.incrementColumn(code.length);
        return true;
      }
    },

    /**
     * Block code.
     */
    blockCode: function(){
      var tok
      if (tok = this.scanEndOfLine(/^-/, 'blockcode')){
        this.tokens.push(tok);
        this.interpolationAllowed = false;
        this.callLexerFunction('pipelessText');
        return true;
      }
    },

    /**
     * Attributes.
     */

    attrs: function(){
      if ('(' == this.input.charAt(0)){
        var startingLine = this.lineno;
        this.tokens.push(this.tok('start-attributes'));
        var index = this.bracketExpression().end
          , str = this.input.substr(1, index - 1);

        this.incrementColumn(1);
        this.assertNestingCorrect(str);

        var quote = '';
        var self = this;

        this.consume(index + 1);

        var whitespaceRe = /[ \n\t]/;
        var quoteRe = /['"]/;

        var escapedAttr = true
        var key = '';
        var val = '';
        var state = characterParser.defaultState();
        var lineno = startingLine;
        var colnoBeginAttr = this.colno;
        var colnoBeginVal;
        var loc = 'key';
        var isEndOfAttribute = function(i){
          // if the key is not started, then the attribute cannot be ended
          if (key.trim() === ''){
            colnoBeginAttr = this.colno;
            return false;
          }
          // if there's nothing more then the attribute must be ended
          if (i === str.length) return true;

          if (loc === 'key'){
            if (whitespaceRe.test(str[i])){
              // find the first non-whitespace character
              for (var x = i; x < str.length; x++){
                if (!whitespaceRe.test(str[x])){
                  // starts a `value`
                  if (str[x] === '=' || str[x] === '!') return false;
                  // will be handled when x === i
                  else if (str[x] === ',') return false;
                  // attribute ended
                  else return true;
                }
              }
            }
            // if there's no whitespace and the character is not ',', the
            // attribute did not end.
            return str[i] === ',';
          } else if (loc === 'value'){
            // if the character is in a string or in parentheses/brackets/braces
            if (state.isNesting() || state.isString()) return false;

            // if the current value expression is not valid JavaScript, then
            // assume that the user did not end the value.  To enforce this,
            // we call `self.assertExpression(val, true)`, but since the other
            // tests are much faster, we run the other tests first.

            if (whitespaceRe.test(str[i])){
              // find the first non-whitespace character
              for (var x = i; x < str.length; x++){
                if (!whitespaceRe.test(str[x])){
                  // if it is a JavaScript punctuator, then assume that it is
                  // a part of the value
                  return (!characterParser.isPunctuator(str[x]) || quoteRe.test(str[x]) || str[x] === ':') && self.assertExpression(val, true);
                }
              }
            }
            // if there's no whitespace and the character is not ',', the
            // attribute did not end.
            return str[i] === ',' && self.assertExpression(val, true);
          }
        }

        for (var i = 0; i <= str.length; i++){
          if (isEndOfAttribute.call(this, i)){
            if (val.trim()){
              var saved = this.colno;
              this.colno = colnoBeginVal;
              this.assertExpression(val);
              this.colno = saved;
            }

            val = val.trim();

            key = key.trim();
            key = key.replace(/^['"]|['"]$/g, '');

            var tok = this.tok('attribute');
            tok.name = key;
            tok.val = '' == val ? true : val;
            tok.col = colnoBeginAttr;
            tok.mustEscape = escapedAttr;
            this.tokens.push(tok);

            key = val = '';
            loc = 'key';
            escapedAttr = false;
            this.lineno = lineno;
          } else {
            switch (loc){
              case 'key-char':
                if (str[i] === quote){
                  loc = 'key';
                  if (i + 1 < str.length && !/[ ,!=\n\t]/.test(str[i + 1]))
                    this.error('INVALID_KEY_CHARACTER', 'Unexpected character "' + str[i + 1] + '" expected ` `, `\\n`, `\t`, `,`, `!` or `=`');
                } else {
                  key += str[i];
                }
                break;
              case 'key':
                if (key === '' && quoteRe.test(str[i])){
                  loc = 'key-char';
                  quote = str[i];
                } else if (str[i] === '!' || str[i] === '='){
                  escapedAttr = str[i] !== '!';
                  if (str[i] === '!'){
                    this.incrementColumn(1);
                    i++;
                  }
                  if (str[i] !== '=') this.error('INVALID_KEY_CHARACTER', 'Unexpected character ' + str[i] + ' expected `=`');
                  loc = 'value';
                  colnoBeginVal = this.colno + 1;
                  state = characterParser.defaultState();
                } else {
                  key += str[i]
                }
                break;
              case 'value':
                state = characterParser.parseChar(str[i], state);
                val += str[i];
                break;
            }
          }
          if (str[i] === '\n'){
            // Save the line number locally to keep this.lineno at the start of
            // the attribute.
            lineno++;
            this.colno = 1;
            // If the key has not been started, update this.lineno immediately.
            if (!key.trim()) this.lineno = lineno;
          } else if (str[i] !== undefined){
            this.incrementColumn(1);
          }
        }

        // Reset the line numbers based on the line started on
        // plus the number of newline characters encountered
        this.lineno = startingLine + (str.match(/\n/g) || []).length;

        this.tokens.push(this.tok('end-attributes'));
        this.incrementColumn(1);
        return true;
      }
    },

    /**
     * &attributes block
     */
    attributesBlock: function(){
      if (/^&attributes\b/.test(this.input)){
        var consumed = 11;
        this.consume(consumed);
        var tok = this.tok('&attributes');
        this.incrementColumn(consumed);
        var args = this.bracketExpression();
        consumed = args.end + 1;
        this.consume(consumed);
        tok.val = args.src;
        this.tokens.push(tok);
        this.incrementColumn(consumed);
        return true;
      }
    },

    /**
     * Indent | Outdent | Newline.
     */

    indent: function(){
      var captures = this.scanIndentation();

      if (captures){
        var indents = captures[1].length;

        this.incrementLine(1);
        this.consume(indents + 1);

        if (' ' == this.input[0] || '\t' == this.input[0]){
          this.error('INVALID_INDENTATION', 'Invalid indentation, you can use tabs or spaces but not both');
        }

        // blank line
        if ('\n' == this.input[0]){
          this.interpolationAllowed = true;
          return this.tok('newline');
        }

        // outdent
        if (indents < this.indentStack[0]){
          while (this.indentStack[0] > indents){
            if (this.indentStack[1] < indents){
              this.error('INCONSISTENT_INDENTATION', 'Inconsistent indentation. Expecting either ' + this.indentStack[1] + ' or ' + this.indentStack[0] + ' spaces/tabs.');
            }
            this.colno = this.indentStack[1] + 1;
            this.tokens.push(this.tok('outdent'));
            this.indentStack.shift();
          }
          // indent
        } else if (indents && indents != this.indentStack[0]){
          this.tokens.push(this.tok('indent', indents));
          this.colno = 1 + indents;
          this.indentStack.unshift(indents);
          // newline
        } else {
          this.tokens.push(this.tok('newline'));
          this.colno = 1 + (this.indentStack[0] || 0);
        }

        this.interpolationAllowed = true;
        return true;
      }
    },

    pipelessText: function pipelessText(indents){
      while (this.callLexerFunction('blank')) ;

      var captures = this.scanIndentation();

      indents = indents || captures && captures[1].length;
      if (indents > this.indentStack[0]){
        this.tokens.push(this.tok('start-pipeless-text'));
        var tokens = [];
        var isMatch;
        // Index in this.input. Can't use this.consume because we might need to
        // retry lexing the block.
        var stringPtr = 0;
        do {
          // text has `\n` as a prefix
          var i = this.input.substr(stringPtr + 1).indexOf('\n');
          if (-1 == i) i = this.input.length - stringPtr - 1;
          var str = this.input.substr(stringPtr + 1, i);
          var lineCaptures = this.indentRe.exec('\n' + str);
          var lineIndents = lineCaptures && lineCaptures[1].length;
          isMatch = lineIndents >= indents || !str.trim();
          if (isMatch){
            // consume test along with `\n` prefix if match
            stringPtr += str.length + 1;
            tokens.push(str.substr(indents));
          } else if (lineIndents > this.indentStack[0]){
            // line is indented less than the first line but is still indented
            // need to retry lexing the text block
            this.tokens.pop();
            return pipelessText.call(this, lineCaptures[1].length);
          }
        } while ((this.input.length - stringPtr) && isMatch);
        this.consume(stringPtr);
        while (this.input.length === 0 && tokens[tokens.length - 1] === '') tokens.pop();
        tokens.forEach(function(token, i){
          this.incrementLine(1);
          if (i !== 0) this.tokens.push(this.tok('newline'));
          this.incrementColumn(indents);
          this.addText('text', token);
        }.bind(this));
        this.tokens.push(this.tok('end-pipeless-text'));
        return true;
      }
    },

    /**
     * Slash.
     */

    slash: function(){
      var tok = this.scan(/^\//, 'slash');
      if (tok){
        this.tokens.push(tok);
        return true;
      }
    },

    /**
     * ':'
     */

    colon: function(){
      var tok = this.scan(/^: +/, ':');
      if (tok){
        this.tokens.push(tok);
        return true;
      }
    },

    fail: function(){
      this.error('UNEXPECTED_TEXT', 'unexpected text "' + this.input.substr(0, 5) + '"');
    },

    callLexerFunction: function(func){
      var rest = [];
      for (var i = 1; i < arguments.length; i++){
        rest.push(arguments[i]);
      }
      var pluginArgs = [this].concat(rest);
      for (var i = 0; i < this.plugins.length; i++){
        var plugin = this.plugins[i];
        if (plugin[func] && plugin[func].apply(plugin, pluginArgs)){
          return true;
        }
      }
      return this[func].apply(this, rest);
    },

    /**
     * Move to the next token
     *
     * @api private
     */

    advance: function(){
      return this.callLexerFunction('blank')
        || this.callLexerFunction('eos')
        || this.callLexerFunction('endInterpolation')
        || this.callLexerFunction('yield')
        || this.callLexerFunction('doctype')
        || this.callLexerFunction('interpolation')
        || this.callLexerFunction('case')
        || this.callLexerFunction('when')
        || this.callLexerFunction('default')
        || this.callLexerFunction('extends')
        || this.callLexerFunction('append')
        || this.callLexerFunction('prepend')
        || this.callLexerFunction('block')
        || this.callLexerFunction('mixinBlock')
        || this.callLexerFunction('include')
        || this.callLexerFunction('mixin')
        || this.callLexerFunction('call')
        || this.callLexerFunction('conditional')
        || this.callLexerFunction('each')
        || this.callLexerFunction('while')
        || this.callLexerFunction('tag')
        || this.callLexerFunction('filter')
        || this.callLexerFunction('blockCode')
        || this.callLexerFunction('code')
        || this.callLexerFunction('id')
        || this.callLexerFunction('dot')
        || this.callLexerFunction('className')
        || this.callLexerFunction('attrs')
        || this.callLexerFunction('attributesBlock')
        || this.callLexerFunction('indent')
        || this.callLexerFunction('text')
        || this.callLexerFunction('textHtml')
        || this.callLexerFunction('comment')
        || this.callLexerFunction('slash')
        || this.callLexerFunction('colon')
        || this.fail();
    },

    /**
     * Return an array of tokens for the current file
     *
     * @returns {Array.<Token>}
     * @api public
     */
    getTokens: function(){
      while (!this.ended){
        this.callLexerFunction('advance');
      }
      return this.tokens;
    }
  };

  return exports;
});

define('pug-parser', ['pug-assert', 'pug-token-stream'], function(assert, TokenStream){
  var inlineTags = [
    'a'
    , 'abbr'
    , 'acronym'
    , 'b'
    , 'br'
    , 'code'
    , 'em'
    , 'font'
    , 'i'
    , 'img'
    , 'ins'
    , 'kbd'
    , 'map'
    , 'samp'
    , 'small'
    , 'span'
    , 'strong'
    , 'sub'
    , 'sup'
  ];

  var exports = parse;
  exports.Parser = Parser;

  function parse(tokens, options){
    var parser = new Parser(tokens, options);
    var ast = parser.parse();
    return JSON.parse(JSON.stringify(ast));
  };

  /**
   * Initialize `Parser` with the given input `str` and `filename`.
   *
   * @param {String} str
   * @param {String} filename
   * @param {Object} options
   * @api public
   */

  function Parser(tokens, options){
    options = options || {};
    if (!Array.isArray(tokens)){
      throw new Error('Expected tokens to be an Array but got "' + (typeof tokens) + '"');
    }
    if (typeof options !== 'object'){
      throw new Error('Expected "options" to be an object but got "' + (typeof options) + '"');
    }
    this.tokens = new TokenStream(tokens);
    this.filename = options.filename;
    this.src = options.src;
    this.inMixin = 0;
    this.plugins = options.plugins || [];
  };

  /**
   * Parser prototype.
   */

  Parser.prototype = {

    /**
     * Save original constructor
     */

    constructor: Parser,

    error: function(code, message, token){
      var err = new Error(code, message, {
        line: token.line,
        column: token.col,
        filename: this.filename,
        src: this.src
      });
      throw err;
    },

    /**
     * Return the next token object.
     *
     * @return {Object}
     * @api private
     */

    advance: function(){
      return this.tokens.advance();
    },

    /**
     * Single token lookahead.
     *
     * @return {Object}
     * @api private
     */

    peek: function(){
      return this.tokens.peek();
    },

    /**
     * `n` token lookahead.
     *
     * @param {Number} n
     * @return {Object}
     * @api private
     */

    lookahead: function(n){
      return this.tokens.lookahead(n);
    },

    /**
     * Parse input returning a string of js for evaluation.
     *
     * @return {String}
     * @api public
     */

    parse: function(){
      var block = this.emptyBlock(0);

      while ('eos' != this.peek().type){
        if ('newline' == this.peek().type){
          this.advance();
        } else if ('text-html' == this.peek().type){
          block.nodes = block.nodes.concat(this.parseTextHtml());
        } else {
          var expr = this.parseExpr();
          if (expr){
            if (expr.type === 'Block'){
              block.nodes = block.nodes.concat(expr.nodes);
            } else {
              block.nodes.push(expr);
            }
          }
        }
      }

      return block;
    },

    /**
     * Expect the given type, or throw an exception.
     *
     * @param {String} type
     * @api private
     */

    expect: function(type){
      if (this.peek().type === type){
        return this.advance();
      } else {
        this.error('INVALID_TOKEN', 'expected "' + type + '", but got "' + this.peek().type + '"', this.peek());
      }
    },

    /**
     * Accept the given `type`.
     *
     * @param {String} type
     * @api private
     */

    accept: function(type){
      if (this.peek().type === type){
        return this.advance();
      }
    },

    initBlock: function(line, nodes){
      /* istanbul ignore if */
      if ((line | 0) !== line) throw new Error('`line` is not an integer');
      /* istanbul ignore if */
      if (!Array.isArray(nodes)) throw new Error('`nodes` is not an array');
      return {
        type: 'Block',
        nodes: nodes,
        line: line,
        filename: this.filename
      };
    },

    emptyBlock: function(line){
      return this.initBlock(line, []);
    },

    runPlugin: function(context, tok){
      var rest = [this];
      for (var i = 2; i < arguments.length; i++){
        rest.push(arguments[i]);
      }
      var pluginContext;
      for (var i = 0; i < this.plugins.length; i++){
        var plugin = this.plugins[i];
        if (plugin[context] && plugin[context][tok.type]){
          if (pluginContext) throw new Error('Multiple plugin handlers found for context ' + JSON.stringify(context) + ', token type ' + JSON.stringify(tok.type));
          pluginContext = plugin[context];
        }
      }
      if (pluginContext) return pluginContext[tok.type].apply(pluginContext, rest);
    },

    /**
     *   tag
     * | doctype
     * | mixin
     * | include
     * | filter
     * | comment
     * | text
     * | text-html
     * | dot
     * | each
     * | code
     * | yield
     * | id
     * | class
     * | interpolation
     */

    parseExpr: function(){
      switch (this.peek().type){
        case 'tag':
          return this.parseTag();
        case 'mixin':
          return this.parseMixin();
        case 'block':
          return this.parseBlock();
        case 'mixin-block':
          return this.parseMixinBlock();
        case 'case':
          return this.parseCase();
        case 'extends':
          return this.parseExtends();
        case 'include':
          return this.parseInclude();
        case 'doctype':
          return this.parseDoctype();
        case 'filter':
          return this.parseFilter();
        case 'comment':
          return this.parseComment();
        case 'text':
        case 'interpolated-code':
        case 'start-pug-interpolation':
          return this.parseText({block: true});
        case 'text-html':
          return this.initBlock(this.peek().line, this.parseTextHtml());
        case 'dot':
          return this.parseDot();
        case 'each':
          return this.parseEach();
        case 'code':
          return this.parseCode();
        case 'blockcode':
          return this.parseBlockCode();
        case 'if':
          return this.parseConditional();
        case 'while':
          return this.parseWhile();
        case 'call':
          return this.parseCall();
        case 'interpolation':
          return this.parseInterpolation();
        case 'yield':
          return this.parseYield();
        case 'id':
        case 'class':
          this.tokens.defer({
            type: 'tag',
            val: 'div',
            line: this.peek().line,
            col: this.peek().col,
            filename: this.filename
          });
          return this.parseExpr();
        default:
          var pluginResult = this.runPlugin('expressionTokens', this.peek());
          if (pluginResult) return pluginResult;
          this.error('INVALID_TOKEN', 'unexpected token "' + this.peek().type + '"', this.peek());
      }
    },

    parseDot: function(){
      this.advance();
      return this.parseTextBlock();
    },

    /**
     * Text
     */

    parseText: function(options){
      var tags = [];
      var lineno = this.peek().line;
      var nextTok = this.peek();
      loop:
        while (true){
          switch (nextTok.type){
            case 'text':
              var tok = this.advance();
              tags.push({
                type: 'Text',
                val: tok.val,
                line: tok.line,
                column: tok.col,
                filename: this.filename
              });
              break;
            case 'interpolated-code':
              var tok = this.advance();
              tags.push({
                type: 'Code',
                val: tok.val,
                buffer: tok.buffer,
                mustEscape: tok.mustEscape !== false,
                isInline: true,
                line: tok.line,
                column: tok.col,
                filename: this.filename
              });
              break;
            case 'newline':
              if (!options || !options.block) break loop;
              var tok = this.advance();
              var nextType = this.peek().type;
              if (nextType === 'text' || nextType === 'interpolated-code'){
                tags.push({
                  type: 'Text',
                  val: '\n',
                  line: tok.line,
                  column: tok.col,
                  filename: this.filename
                });
              }
              break;
            case 'start-pug-interpolation':
              this.advance();
              tags.push(this.parseExpr());
              this.expect('end-pug-interpolation');
              break;
            default:
              var pluginResult = this.runPlugin('textTokens', nextTok, tags);
              if (pluginResult) break;
              break loop;
          }
          nextTok = this.peek();
        }
      if (tags.length === 1) return tags[0];
      else return this.initBlock(lineno, tags);
    },

    parseTextHtml: function(){
      var nodes = [];
      var currentNode = null;
      loop:
        while (true){
          switch (this.peek().type){
            case 'text-html':
              var text = this.advance();
              if (!currentNode){
                currentNode = {
                  type: 'Text',
                  val: text.val,
                  filename: this.filename,
                  line: text.line,
                  column: text.col,
                  isHtml: true
                };
                nodes.push(currentNode);
              } else {
                currentNode.val += '\n' + text.val;
              }
              break;
            case 'indent':
              var block = this.block();
              block.nodes.forEach(function(node){
                if (node.isHtml){
                  if (!currentNode){
                    currentNode = node;
                    nodes.push(currentNode);
                  } else {
                    currentNode.val += '\n' + node.val;
                  }
                } else {
                  currentNode = null;
                  nodes.push(node);
                }
              });
              break;
            case 'code':
              currentNode = null;
              nodes.push(this.parseCode(true));
              break;
            case 'newline':
              this.advance();
              break;
            default:
              break loop;
          }
        }
      return nodes;
    },

    /**
     *   ':' expr
     * | block
     */

    parseBlockExpansion: function(){
      var tok = this.accept(':');
      if (tok){
        var expr = this.parseExpr();
        return expr.type === 'Block' ? expr : this.initBlock(tok.line, [expr]);
      } else {
        return this.block();
      }
    },

    /**
     * case
     */

    parseCase: function(){
      var tok = this.expect('case');
      var node = {
        type: 'Case',
        expr: tok.val,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };

      var block = this.emptyBlock(tok.line + 1);
      this.expect('indent');
      while ('outdent' != this.peek().type){
        switch (this.peek().type){
          case 'comment':
          case 'newline':
            this.advance();
            break;
          case 'when':
            block.nodes.push(this.parseWhen());
            break;
          case 'default':
            block.nodes.push(this.parseDefault());
            break;
          default:
            var pluginResult = this.runPlugin('caseTokens', this.peek(), block);
            if (pluginResult) break;
            this.error('INVALID_TOKEN', 'Unexpected token "' + this.peek().type
              + '", expected "when", "default" or "newline"', this.peek());
        }
      }
      this.expect('outdent');

      node.block = block;

      return node;
    },

    /**
     * when
     */

    parseWhen: function(){
      var tok = this.expect('when');
      if (this.peek().type !== 'newline'){
        return {
          type: 'When',
          expr: tok.val,
          block: this.parseBlockExpansion(),
          debug: false,
          line: tok.line,
          column: tok.col,
          filename: this.filename
        };
      } else {
        return {
          type: 'When',
          expr: tok.val,
          debug: false,
          line: tok.line,
          column: tok.col,
          filename: this.filename
        };
      }
    },

    /**
     * default
     */

    parseDefault: function(){
      var tok = this.expect('default');
      return {
        type: 'When',
        expr: 'default',
        block: this.parseBlockExpansion(),
        debug: false,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
    },

    /**
     * code
     */

    parseCode: function(noBlock){
      var tok = this.expect('code');
      assert(typeof tok.mustEscape === 'boolean', 'Please update to the newest version of pug-lexer.');
      var node = {
        type: 'Code',
        val: tok.val,
        buffer: tok.buffer,
        mustEscape: tok.mustEscape !== false,
        isInline: !!noBlock,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
      // todo: why is this here?  It seems like a hacky workaround
      if (node.val.match(/^ *else/)) node.debug = false;

      if (noBlock) return node;

      var block;

      // handle block
      block = 'indent' == this.peek().type;
      if (block){
        if (tok.buffer){
          this.error('BLOCK_IN_BUFFERED_CODE', 'Buffered code cannot have a block attached to it', this.peek());
        }
        node.block = this.block();
      }

      return node;
    },
    parseConditional: function(){
      var tok = this.expect('if');
      var node = {
        type: 'Conditional',
        test: tok.val,
        consequent: this.emptyBlock(tok.line),
        alternate: null,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };

      // handle block
      if ('indent' == this.peek().type){
        node.consequent = this.block();
      }

      var currentNode = node;
      while (true){
        if (this.peek().type === 'newline'){
          this.expect('newline');
        } else if (this.peek().type === 'else-if'){
          tok = this.expect('else-if');
          currentNode = (
            currentNode.alternate = {
              type: 'Conditional',
              test: tok.val,
              consequent: this.emptyBlock(tok.line),
              alternate: null,
              line: tok.line,
              column: tok.col,
              filename: this.filename
            }
          );
          if ('indent' == this.peek().type){
            currentNode.consequent = this.block();
          }
        } else if (this.peek().type === 'else'){
          this.expect('else');
          if (this.peek().type === 'indent'){
            currentNode.alternate = this.block();
          }
          break;
        } else {
          break;
        }
      }

      return node;
    },
    parseWhile: function(){
      var tok = this.expect('while');
      var node = {
        type: 'While',
        test: tok.val,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };

      // handle block
      if ('indent' == this.peek().type){
        node.block = this.block();
      } else {
        node.block = this.emptyBlock(tok.line);
      }

      return node;
    },

    /**
     * block code
     */

    parseBlockCode: function(){
      var tok = this.expect('blockcode');
      var line = tok.line;
      var column = tok.col;
      var body = this.peek();
      var text = '';
      if (body.type === 'start-pipeless-text'){
        this.advance();
        while (this.peek().type !== 'end-pipeless-text'){
          tok = this.advance();
          switch (tok.type){
            case 'text':
              text += tok.val;
              break;
            case 'newline':
              text += '\n';
              break;
            default:
              var pluginResult = this.runPlugin('blockCodeTokens', tok, tok);
              if (pluginResult){
                text += pluginResult;
                break;
              }
              this.error('INVALID_TOKEN', 'Unexpected token type: ' + tok.type, tok);
          }
        }
        this.advance();
      }
      return {
        type: 'Code',
        val: text,
        buffer: false,
        mustEscape: false,
        isInline: false,
        line: line,
        column: column,
        filename: this.filename
      };
    },
    /**
     * comment
     */

    parseComment: function(){
      var tok = this.expect('comment');
      var block;
      if (block = this.parseTextBlock()){
        return {
          type: 'BlockComment',
          val: tok.val,
          block: block,
          buffer: tok.buffer,
          line: tok.line,
          column: tok.col,
          filename: this.filename
        };
      } else {
        return {
          type: 'Comment',
          val: tok.val,
          buffer: tok.buffer,
          line: tok.line,
          column: tok.col,
          filename: this.filename
        };
      }
    },

    /**
     * doctype
     */

    parseDoctype: function(){
      var tok = this.expect('doctype');
      return {
        type: 'Doctype',
        val: tok.val,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
    },

    parseIncludeFilter: function(){
      var tok = this.expect('filter');
      var attrs = [];

      if (this.peek().type === 'start-attributes'){
        attrs = this.attrs();
      }

      return {
        type: 'IncludeFilter',
        name: tok.val,
        attrs: attrs,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
    },

    /**
     * filter attrs? text-block
     */

    parseFilter: function(){
      var tok = this.expect('filter');
      var block, attrs = [];

      if (this.peek().type === 'start-attributes'){
        attrs = this.attrs();
      }

      if (this.peek().type === 'text'){
        var textToken = this.advance();
        block = this.initBlock(textToken.line, [
          {
            type: 'Text',
            val: textToken.val,
            line: textToken.line,
            column: textToken.col,
            filename: this.filename
          }
        ]);
      } else if (this.peek().type === 'filter'){
        block = this.initBlock(tok.line, [this.parseFilter()]);
      } else {
        block = this.parseTextBlock() || this.emptyBlock(tok.line);
      }

      return {
        type: 'Filter',
        name: tok.val,
        block: block,
        attrs: attrs,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
    },

    /**
     * each block
     */

    parseEach: function(){
      var tok = this.expect('each');
      var node = {
        type: 'Each',
        obj: tok.code,
        val: tok.val,
        key: tok.key,
        block: this.block(),
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
      if (this.peek().type == 'else'){
        this.advance();
        node.alternate = this.block();
      }
      return node;
    },

    /**
     * 'extends' name
     */

    parseExtends: function(){
      var tok = this.expect('extends');
      var path = this.expect('path');
      return {
        type: 'Extends',
        file: {
          type: 'FileReference',
          path: path.val.trim(),
          line: path.line,
          column: path.col,
          filename: this.filename
        },
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
    },

    /**
     * 'block' name block
     */

    parseBlock: function(){
      var tok = this.expect('block');

      var node = 'indent' == this.peek().type ? this.block() : this.emptyBlock(tok.line);
      node.type = 'NamedBlock';
      node.name = tok.val.trim();
      node.mode = tok.mode;
      node.line = tok.line;
      node.column = tok.col;

      return node;
    },

    parseMixinBlock: function(){
      var tok = this.expect('mixin-block');
      if (!this.inMixin){
        this.error('BLOCK_OUTISDE_MIXIN', 'Anonymous blocks are not allowed unless they are part of a mixin.', tok);
      }
      return {
        type: 'MixinBlock',
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
    },

    parseYield: function(){
      var tok = this.expect('yield');
      return {
        type: 'YieldBlock',
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
    },

    /**
     * include block?
     */

    parseInclude: function(){
      var tok = this.expect('include');
      var node = {
        type: 'Include',
        file: {
          type: 'FileReference',
          filename: this.filename
        },
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };
      var filters = [];
      while (this.peek().type === 'filter'){
        filters.push(this.parseIncludeFilter());
      }
      var path = this.expect('path');

      node.file.path = path.val.trim();
      node.file.line = path.line;
      node.file.column = path.col;

      if ((/\.jade$/.test(node.file.path) || /\.pug$/.test(node.file.path)) && !filters.length){
        node.block = 'indent' == this.peek().type ? this.block() : this.emptyBlock(tok.line);
        if (/\.jade$/.test(node.file.path)){
          console.warn(
            this.filename + ', line ' + tok.line +
            ':\nThe .jade extension is deprecated, use .pug for "' + node.file.path + '".'
          );
        }
      } else {
        node.type = 'RawInclude';
        node.filters = filters;
        if (this.peek().type === 'indent'){
          this.error('RAW_INCLUDE_BLOCK', 'Raw inclusion cannot contain a block', this.peek());
        }
      }
      return node;
    },

    /**
     * call ident block
     */

    parseCall: function(){
      var tok = this.expect('call');
      var name = tok.val;
      var args = tok.args;
      var mixin = {
        type: 'Mixin',
        name: name,
        args: args,
        block: this.emptyBlock(tok.line),
        call: true,
        attrs: [],
        attributeBlocks: [],
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };

      this.tag(mixin);
      if (mixin.code){
        mixin.block.nodes.push(mixin.code);
        delete mixin.code;
      }
      if (mixin.block.nodes.length === 0) mixin.block = null;
      return mixin;
    },

    /**
     * mixin block
     */

    parseMixin: function(){
      var tok = this.expect('mixin');
      var name = tok.val;
      var args = tok.args;

      if ('indent' == this.peek().type){
        this.inMixin++;
        var mixin = {
          type: 'Mixin',
          name: name,
          args: args,
          block: this.block(),
          call: false,
          line: tok.line,
          column: tok.col,
          filename: this.filename
        };
        this.inMixin--;
        return mixin;
      } else {
        this.error('MIXIN_WITHOUT_BODY', 'Mixin ' + name + ' declared without body', tok);
      }
    },

    /**
     * indent (text | newline)* outdent
     */

    parseTextBlock: function(){
      var tok = this.accept('start-pipeless-text');
      if (!tok) return;
      var block = this.emptyBlock(tok.line);
      while (this.peek().type !== 'end-pipeless-text'){
        var tok = this.advance();
        switch (tok.type){
          case 'text':
            block.nodes.push({
              type: 'Text',
              val: tok.val,
              line: tok.line,
              column: tok.col,
              filename: this.filename
            });
            break;
          case 'newline':
            block.nodes.push({
              type: 'Text',
              val: '\n',
              line: tok.line,
              column: tok.col,
              filename: this.filename
            });
            break;
          case 'start-pug-interpolation':
            block.nodes.push(this.parseExpr());
            this.expect('end-pug-interpolation');
            break;
          case 'interpolated-code':
            block.nodes.push({
              type: 'Code',
              val: tok.val,
              buffer: tok.buffer,
              mustEscape: tok.mustEscape !== false,
              isInline: true,
              line: tok.line,
              column: tok.col,
              filename: this.filename
            });
            break;
          default:
            var pluginResult = this.runPlugin('textBlockTokens', tok, block, tok);
            if (pluginResult) break;
            this.error('INVALID_TOKEN', 'Unexpected token type: ' + tok.type, tok);
        }
      }
      this.advance();
      return block;
    },

    /**
     * indent expr* outdent
     */

    block: function(){
      var tok = this.expect('indent');
      var block = this.emptyBlock(tok.line);
      while ('outdent' != this.peek().type){
        if ('newline' == this.peek().type){
          this.advance();
        } else if ('text-html' == this.peek().type){
          block.nodes = block.nodes.concat(this.parseTextHtml());
        } else {
          var expr = this.parseExpr();
          if (expr.type === 'Block'){
            block.nodes = block.nodes.concat(expr.nodes);
          } else {
            block.nodes.push(expr);
          }
        }
      }
      this.expect('outdent');
      return block;
    },

    /**
     * interpolation (attrs | class | id)* (text | code | ':')? newline* block?
     */

    parseInterpolation: function(){
      var tok = this.advance();
      var tag = {
        type: 'InterpolatedTag',
        expr: tok.val,
        selfClosing: false,
        block: this.emptyBlock(tok.line),
        attrs: [],
        attributeBlocks: [],
        isInline: false,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };

      return this.tag(tag, {selfClosingAllowed: true});
    },

    /**
     * tag (attrs | class | id)* (text | code | ':')? newline* block?
     */

    parseTag: function(){
      var tok = this.advance();
      var tag = {
        type: 'Tag',
        name: tok.val,
        selfClosing: false,
        block: this.emptyBlock(tok.line),
        attrs: [],
        attributeBlocks: [],
        isInline: inlineTags.indexOf(tok.val) !== -1,
        line: tok.line,
        column: tok.col,
        filename: this.filename
      };

      return this.tag(tag, {selfClosingAllowed: true});
    },

    /**
     * Parse tag.
     */

    tag: function(tag, options){
      var seenAttrs = false;
      var attributeNames = [];
      var selfClosingAllowed = options && options.selfClosingAllowed;
      // (attrs | class | id)*
      out:
        while (true){
          switch (this.peek().type){
            case 'id':
            case 'class':
              var tok = this.advance();
              if (tok.type === 'id'){
                if (attributeNames.indexOf('id') !== -1){
                  this.error('DUPLICATE_ID', 'Duplicate attribute "id" is not allowed.', tok);
                }
                attributeNames.push('id');
              }
              tag.attrs.push({
                name: tok.type,
                val: "'" + tok.val + "'",
                line: tok.line,
                column: tok.col,
                filename: this.filename,
                mustEscape: false
              });
              continue;
            case 'start-attributes':
              if (seenAttrs){
                console.warn(this.filename + ', line ' + this.peek().line + ':\nYou should not have pug tags with multiple attributes.');
              }
              seenAttrs = true;
              tag.attrs = tag.attrs.concat(this.attrs(attributeNames));
              continue;
            case '&attributes':
              var tok = this.advance();
              tag.attributeBlocks.push({
                type: 'AttributeBlock',
                val: tok.val,
                line: tok.line,
                column: tok.col,
                filename: this.filename
              });
              break;
            default:
              var pluginResult = this.runPlugin('tagAttributeTokens', this.peek(), tag, attributeNames);
              if (pluginResult) break;
              break out;
          }
        }

      // check immediate '.'
      if ('dot' == this.peek().type){
        tag.textOnly = true;
        this.advance();
      }

      // (text | code | ':')?
      switch (this.peek().type){
        case 'text':
        case 'interpolated-code':
          var text = this.parseText();
          if (text.type === 'Block'){
            tag.block.nodes.push.apply(tag.block.nodes, text.nodes);
          } else {
            tag.block.nodes.push(text);
          }
          break;
        case 'code':
          tag.block.nodes.push(this.parseCode(true));
          break;
        case ':':
          this.advance();
          var expr = this.parseExpr();
          tag.block = expr.type === 'Block' ? expr : this.initBlock(tag.line, [expr]);
          break;
        case 'newline':
        case 'indent':
        case 'outdent':
        case 'eos':
        case 'start-pipeless-text':
        case 'end-pug-interpolation':
          break;
        case 'slash':
          if (selfClosingAllowed){
            this.advance();
            tag.selfClosing = true;
            break;
          }
        default:
          var pluginResult = this.runPlugin('tagTokens', this.peek(), tag, options);
          if (pluginResult) break;
          this.error('INVALID_TOKEN', 'Unexpected token `' + this.peek().type + '` expected `text`, `interpolated-code`, `code`, `:`' + (selfClosingAllowed ? ', `slash`' : '') + ', `newline` or `eos`', this.peek())
      }

      // newline*
      while ('newline' == this.peek().type) this.advance();

      // block?
      if (tag.textOnly){
        tag.block = this.parseTextBlock() || this.emptyBlock(tag.line);
      } else if ('indent' == this.peek().type){
        var block = this.block();
        for (var i = 0, len = block.nodes.length; i < len; ++i){
          tag.block.nodes.push(block.nodes[i]);
        }
      }

      return tag;
    },

    attrs: function(attributeNames){
      this.expect('start-attributes');

      var attrs = [];
      var tok = this.advance();
      while (tok.type === 'attribute'){
        if (tok.name !== 'class' && attributeNames){
          if (attributeNames.indexOf(tok.name) !== -1){
            this.error('DUPLICATE_ATTRIBUTE', 'Duplicate attribute "' + tok.name + '" is not allowed.', tok);
          }
          attributeNames.push(tok.name);
        }
        attrs.push({
          name: tok.name,
          val: tok.val,
          line: tok.line,
          column: tok.col,
          filename: this.filename,
          mustEscape: tok.mustEscape !== false
        });
        tok = this.advance();
      }
      this.tokens.defer(tok);
      this.expect('end-attributes');
      return attrs;
    }
  };

  return exports;
});

define('doctypes', function(){
  return {
    'html': '<!DOCTYPE html>',
    'xml': '<?xml version="1.0" encoding="utf-8" ?>',
    'transitional': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    'strict': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">',
    'frameset': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Frameset//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd">',
    '1.1': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
    'basic': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML Basic 1.1//EN" "http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd">',
    'mobile': '<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD XHTML Mobile 1.2//EN" "http://www.openmobilealliance.org/tech/DTD/xhtml-mobile12.dtd">',
    'plist': '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  };
});

define('void-elements', function(){
  return {
    "area": true,
    "base": true,
    "br": true,
    "col": true,
    "embed": true,
    "hr": true,
    "img": true,
    "input": true,
    "keygen": true,
    "link": true,
    "menuitem": true,
    "meta": true,
    "param": true,
    "source": true,
    "track": true,
    "wbr": true
  };
});

define('pug-runtime-build', function(){
  var dependencies = {
    "has_own_property": [],
    "merge": [
      "style"
    ],
    "classes_array": [
      "classes",
      "escape"
    ],
    "classes_object": [
      "has_own_property"
    ],
    "classes": [
      "classes_array",
      "classes_object"
    ],
    "style": [
      "has_own_property"
    ],
    "attr": [
      "escape"
    ],
    "attrs": [
      "attr",
      "classes",
      "has_own_property",
      "style"
    ],
    "match_html": [],
    "escape": [
      "match_html"
    ],
    "rethrow": []
  };
  var internals = {
    "dependencies": true,
    "internals": true,
    "has_own_property": true,
    "classes_array": true,
    "classes_object": true,
    "match_html": true
  };
  var sources = {
    "has_own_property": "var pug_has_own_property=Object.prototype.hasOwnProperty;",
    "merge": "function pug_merge(r,e){if(1===arguments.length){for(var t=r[0],a=1;a<r.length;a++)t=pug_merge(t,r[a]);return t}for(var g in e)if(\"class\"===g){var l=r[g]||[];r[g]=(Array.isArray(l)?l:[l]).concat(e[g]||[])}else if(\"style\"===g){var l=pug_style(r[g]),n=pug_style(e[g]);r[g]=l+n}else r[g]=e[g];return r}",
    "classes_array": "function pug_classes_array(r,a){for(var s,e=\"\",u=\"\",c=Array.isArray(a),g=0;g<r.length;g++)s=pug_classes(r[g]),s&&(c&&a[g]&&(s=pug_escape(s)),e=e+u+s,u=\" \");return e}",
    "classes_object": "function pug_classes_object(r){var a=\"\",n=\"\";for(var o in r)o&&r[o]&&pug_has_own_property.call(r,o)&&(a=a+n+o,n=\" \");return a}",
    "classes": "function pug_classes(s,r){return Array.isArray(s)?pug_classes_array(s,r):s&&\"object\"==typeof s?pug_classes_object(s):s||\"\"}",
    "style": "function pug_style(r){if(!r)return\"\";if(\"object\"==typeof r){var t=\"\";for(var e in r)pug_has_own_property.call(r,e)&&(t=t+e+\":\"+r[e]+\";\");return t}return r+=\"\",\";\"!==r[r.length-1]?r+\";\":r}",
    "attr": "function pug_attr(t,e,n,f){return e!==!1&&null!=e&&(e||\"class\"!==t&&\"style\"!==t)?e===!0?\" \"+(f?t:t+'=\"'+t+'\"'):(\"function\"==typeof e.toJSON&&(e=e.toJSON()),\"string\"==typeof e||(e=JSON.stringify(e),n||e.indexOf('\"')===-1)?(n&&(e=pug_escape(e)),\" \"+t+'=\"'+e+'\"'):\" \"+t+\"='\"+e.replace(/'/g,\"&#39;\")+\"'\"):\"\"}",
    "attrs": "function pug_attrs(t,r){var a=\"\";for(var s in t)if(pug_has_own_property.call(t,s)){var u=t[s];if(\"class\"===s){u=pug_classes(u),a=pug_attr(s,u,!1,r)+a;continue}\"style\"===s&&(u=pug_style(u)),a+=pug_attr(s,u,!1,r)}return a}",
    "match_html": "var pug_match_html=/[\"&<>]/;",
    "escape": "function pug_escape(e){var a=\"\"+e,t=pug_match_html.exec(a);if(!t)return e;var r,c,n,s=\"\";for(r=t.index,c=0;r<a.length;r++){switch(a.charCodeAt(r)){case 34:n=\"&quot;\";break;case 38:n=\"&amp;\";break;case 60:n=\"&lt;\";break;case 62:n=\"&gt;\";break;default:continue}c!==r&&(s+=a.substring(c,r)),c=r+1,s+=n}return c!==r?s+a.substring(c,r):s}",
    "rethrow": "function pug_rethrow(n,e,r,t){if(!(n instanceof Error))throw n;if(!(\"undefined\"==typeof window&&e||t))throw n.message+=\" on line \"+r,n;try{t=t||require(\"fs\").readFileSync(e,\"utf8\")}catch(e){pug_rethrow(n,null,r)}var i=3,a=t.split(\"\\n\"),o=Math.max(r-i,0),h=Math.min(a.length,r+i),i=a.slice(o,h).map(function(n,e){var t=e+o+1;return(t==r?\"  > \":\"    \")+t+\"| \"+n}).join(\"\\n\");throw n.path=e,n.message=(e||\"Pug\")+\":\"+r+\"\\n\"+i+\"\\n\\n\"+n.message,n}"
  };

  var exports = build;

  function build(functions){
    var fns = [];
    functions = functions.filter(function(fn){
      return !internals[fn];
    });
    for (var i = 0; i < functions.length; i++){
      if (fns.indexOf(functions[i]) === -1){
        fns.push(functions[i]);
        functions.push.apply(functions, dependencies[functions[i]]);
      }
    }
    return fns.sort().map(function(name){
      return sources[name];
    }).join('\n');
  }

  return exports;
});

define('js-stringify', function(){
  return function(obj){
    if (obj instanceof Date){
      return 'new Date(' + stringify(obj.toISOString()) + ')';
    }
    if (obj === undefined){
      return 'undefined';
    }
    return JSON.stringify(obj)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
      .replace(/</g, '\\u003C')
      .replace(/>/g, '\\u003E')
      .replace(/\//g, '\\u002F');
  }
});

define('pug-runtime', function(){
  var exports = {};
  var pug_has_own_property = Object.prototype.hasOwnProperty;

  /**
   * Merge two attribute objects giving precedence
   * to values in object `b`. Classes are special-cased
   * allowing for arrays and merging/joining appropriately
   * resulting in a string.
   *
   * @param {Object} a
   * @param {Object} b
   * @return {Object} a
   * @api private
   */

  exports.merge = pug_merge;

  function pug_merge(a, b){
    if (arguments.length === 1){
      var attrs = a[0];
      for (var i = 1; i < a.length; i++){
        attrs = pug_merge(attrs, a[i]);
      }
      return attrs;
    }

    for (var key in b){
      if (key === 'class'){
        var valA = a[key] || [];
        a[key] = (Array.isArray(valA) ? valA : [valA]).concat(b[key] || []);
      } else if (key === 'style'){
        var valA = pug_style(a[key]);
        var valB = pug_style(b[key]);
        a[key] = valA + valB;
      } else {
        a[key] = b[key];
      }
    }

    return a;
  };

  /**
   * Process array, object, or string as a string of classes delimited by a space.
   *
   * If `val` is an array, all members of it and its subarrays are counted as
   * classes. If `escaping` is an array, then whether or not the item in `val` is
   * escaped depends on the corresponding item in `escaping`. If `escaping` is
   * not an array, no escaping is done.
   *
   * If `val` is an object, all the keys whose value is truthy are counted as
   * classes. No escaping is done.
   *
   * If `val` is a string, it is counted as a class. No escaping is done.
   *
   * @param {(Array.<string>|Object.<string, boolean>|string)} val
   * @param {?Array.<string>} escaping
   * @return {String}
   */
  exports.classes = pug_classes;

  function pug_classes_array(val, escaping){
    var classString = '', className, padding = '', escapeEnabled = Array.isArray(escaping);
    for (var i = 0; i < val.length; i++){
      className = pug_classes(val[i]);
      if (!className) continue;
      escapeEnabled && escaping[i] && (className = pug_escape(className));
      classString = classString + padding + className;
      padding = ' ';
    }
    return classString;
  }

  function pug_classes_object(val){
    var classString = '', padding = '';
    for (var key in val){
      if (key && val[key] && pug_has_own_property.call(val, key)){
        classString = classString + padding + key;
        padding = ' ';
      }
    }
    return classString;
  }

  function pug_classes(val, escaping){
    if (Array.isArray(val)){
      return pug_classes_array(val, escaping);
    } else if (val && typeof val === 'object'){
      return pug_classes_object(val);
    } else {
      return val || '';
    }
  }

  /**
   * Convert object or string to a string of CSS styles delimited by a semicolon.
   *
   * @param {(Object.<string, string>|string)} val
   * @return {String}
   */

  exports.style = pug_style;

  function pug_style(val){
    if (!val) return '';
    if (typeof val === 'object'){
      var out = '';
      for (var style in val){
        /* istanbul ignore else */
        if (pug_has_own_property.call(val, style)){
          out = out + style + ':' + val[style] + ';';
        }
      }
      return out;
    } else {
      val += '';
      if (val[val.length - 1] !== ';')
        return val + ';';
      return val;
    }
  };

  /**
   * Render the given attribute.
   *
   * @param {String} key
   * @param {String} val
   * @param {Boolean} escaped
   * @param {Boolean} terse
   * @return {String}
   */
  exports.attr = pug_attr;

  function pug_attr(key, val, escaped, terse){
    if (val === false || val == null || !val && (key === 'class' || key === 'style')){
      return '';
    }
    if (val === true){
      return ' ' + (terse ? key : key + '="' + key + '"');
    }
    if (typeof val.toJSON === 'function'){
      val = val.toJSON();
    }
    if (typeof val !== 'string'){
      val = JSON.stringify(val);
      if (!escaped && val.indexOf('"') !== -1){
        return ' ' + key + '=\'' + val.replace(/'/g, '&#39;') + '\'';
      }
    }
    if (escaped) val = pug_escape(val);
    return ' ' + key + '="' + val + '"';
  };

  /**
   * Render the given attributes object.
   *
   * @param {Object} obj
   * @param {Object} terse whether to use HTML5 terse boolean attributes
   * @return {String}
   */
  exports.attrs = pug_attrs;

  function pug_attrs(obj, terse){
    var attrs = '';

    for (var key in obj){
      if (pug_has_own_property.call(obj, key)){
        var val = obj[key];

        if ('class' === key){
          val = pug_classes(val);
          attrs = pug_attr(key, val, false, terse) + attrs;
          continue;
        }
        if ('style' === key){
          val = pug_style(val);
        }
        attrs += pug_attr(key, val, false, terse);
      }
    }

    return attrs;
  };

  /**
   * Escape the given string of `html`.
   *
   * @param {String} html
   * @return {String}
   * @api private
   */

  var pug_match_html = /["&<>]/;
  exports.escape = pug_escape;

  function pug_escape(_html){
    var html = '' + _html;
    var regexResult = pug_match_html.exec(html);
    if (!regexResult) return _html;

    var result = '';
    var i, lastIndex, escape;
    for (i = regexResult.index, lastIndex = 0; i < html.length; i++){
      switch (html.charCodeAt(i)){
        case 34:
          escape = '&quot;';
          break;
        case 38:
          escape = '&amp;';
          break;
        case 60:
          escape = '&lt;';
          break;
        case 62:
          escape = '&gt;';
          break;
        default:
          continue;
      }
      if (lastIndex !== i) result += html.substring(lastIndex, i);
      lastIndex = i + 1;
      result += escape;
    }
    if (lastIndex !== i) return result + html.substring(lastIndex, i);
    else return result;
  };

  /**
   * Re-throw the given `err` in context to the
   * the pug in `filename` at the given `lineno`.
   *
   * @param {Error} err
   * @param {String} filename
   * @param {String} lineno
   * @param {String} str original source
   * @api private
   */

  exports.rethrow = pug_rethrow;

  function pug_rethrow(err, filename, lineno, str){
    if (!(err instanceof Error)) throw err;
    if ((typeof window != 'undefined' || !filename) && !str){
      err.message += ' on line ' + lineno;
      throw err;
    }
    try {
      str = str;// || require('fs').readFileSync(filename, 'utf8')
    } catch (ex) {
      pug_rethrow(err, null, lineno)
    }
    var context = 3
      , lines = str.split('\n')
      , start = Math.max(lineno - context, 0)
      , end = Math.min(lines.length, lineno + context);

    // Error context
    var context = lines.slice(start, end).map(function(line, i){
      var curr = i + start + 1;
      return (curr == lineno ? '  > ' : '    ')
        + curr
        + '| '
        + line;
    }).join('\n');

    // Alter exception message
    err.path = filename;
    err.message = (filename || 'Pug') + ':' + lineno
      + '\n' + context + '\n\n' + err.message;
    throw err;
  };

  return exports;
});

define('pug-with', function(){
  return function(v, js){
    //console.log('pug-with stubbed');
    return js;
  }
});

define('pug-wrap', ['pug-runtime'], function(){
  var runtime = require('pug-runtime');

  return function(template, templateName){
    templateName = templateName || 'template';
    return Function('pug',
      template + '\n' +
      'return ' + templateName + ';'
    )(runtime);
  }

});

define('pug-constantinople', function(){
  return function(){
    //console.log('pug-constantinople not implemented', arguments);
    return false;
  }
});

define('pug-attrs', ['pug-assert', 'pug-runtime', 'js-stringify', 'pug-constantinople'], function(){
  var assert = require('pug-assert');
  var constantinople = require('pug-constantinople');
  var runtime = require('pug-runtime');
  var stringify = require('js-stringify');

  function isConstant(src){
    return constantinople(src, {pug: runtime, 'pug_interp': undefined});
  }

  function toConstant(src){
    return constantinople.toConstant(src, {pug: runtime, 'pug_interp': undefined});
  }

  var exports = compileAttrs;

  /**
   * options:
   *  - terse
   *  - runtime
   *  - format ('html' || 'object')
   */
  function compileAttrs(attrs, options){
    assert(Array.isArray(attrs), 'Attrs should be an array');
    assert(attrs.every(function(attr){
      return attr &&
        typeof attr === 'object' &&
        typeof attr.name === 'string' &&
        (typeof attr.val === 'string' || typeof attr.val === 'boolean') &&
        typeof attr.mustEscape === 'boolean';
    }), 'All attributes should be supplied as an object of the form {name, val, mustEscape}');
    assert(options && typeof options === 'object', 'Options should be an object');
    assert(typeof options.terse === 'boolean', 'Options.terse should be a boolean');
    assert(
      typeof options.runtime === 'function',
      'Options.runtime should be a function that takes a runtime function name and returns the source code that will evaluate to that function at runtime'
    );
    assert(
      options.format === 'html' || options.format === 'object',
      'Options.format should be "html" or "object"'
    );

    var buf = [];
    var classes = [];
    var classEscaping = [];

    function addAttribute(key, val, mustEscape, buf){
      if (isConstant(val)){
        if (options.format === 'html'){
          var str = stringify(runtime.attr(key, toConstant(val), mustEscape, options.terse));
          var last = buf[buf.length - 1];
          if (last && last[last.length - 1] === str[0]){
            buf[buf.length - 1] = last.substr(0, last.length - 1) + str.substr(1);
          } else {
            buf.push(str);
          }
        } else {
          val = toConstant(val);
          if (mustEscape){
            val = runtime.escape(val);
          }
          buf.push(stringify(key) + ': ' + stringify(val));
        }
      } else {
        if (options.format === 'html'){
          buf.push(options.runtime('attr') + '("' + key + '", ' + val + ', ' + stringify(mustEscape) + ', ' + stringify(options.terse) + ')');
        } else {
          if (mustEscape){
            val = options.runtime('escape') + '(' + val + ')';
          }
          buf.push(stringify(key) + ': ' + val);
        }
      }
    }

    attrs.forEach(function(attr){
      var key = attr.name;
      var val = attr.val;
      var mustEscape = attr.mustEscape;

      if (key === 'class'){
        classes.push(val);
        classEscaping.push(mustEscape);
      } else {
        if (key === 'style'){
          if (isConstant(val)){
            val = stringify(runtime.style(toConstant(val)));
          } else {
            val = options.runtime('style') + '(' + val + ')';
          }
        }
        addAttribute(key, val, mustEscape, buf);
      }
    });
    var classesBuf = [];
    if (classes.length){
      if (classes.every(isConstant)){
        addAttribute(
          'class',
          stringify(runtime.classes(classes.map(toConstant), classEscaping)),
          false,
          classesBuf
        );
      } else {
        classes = classes.map(function(cls, i){
          if (isConstant(cls)){
            cls = stringify(classEscaping[i] ? runtime.escape(toConstant(cls)) : toConstant(cls));
            classEscaping[i] = false;
          }
          return cls;
        });
        addAttribute(
          'class',
          options.runtime('classes') + '([' + classes.join(',') + '], ' + stringify(classEscaping) + ')',
          false,
          classesBuf
        );
      }
    }
    buf = classesBuf.concat(buf);
    if (options.format === 'html') return buf.length ? buf.join('+') : '""';
    else return '{' + buf.join(',') + '}';
  }

  return exports;
});

define('pug-code-gen', [
    'doctypes', 'void-elements', 'pug-runtime', 'pug-runtime-build',
    'pug-attrs',
    'js-stringify',
    'pug-constantinople',
    'pug-with'
  ],
  function(){

    var doctypes = require('doctypes');
    var selfClosing = require('void-elements');
    var buildRuntime = require('pug-runtime-build');
    var runtime = require('pug-runtime');
    var compileAttrs = require('pug-attrs');
    var constantinople = require('pug-constantinople');
    var stringify = require('js-stringify');
    var addWith = require('pug-with');

// This is used to prevent pretty printing inside certain tags
    var WHITE_SPACE_SENSITIVE_TAGS = {
      pre: true,
      textarea: true
    };

    var INTERNAL_VARIABLES = [
      'pug',
      'pug_mixins',
      'pug_interp',
      'pug_debug_filename',
      'pug_debug_line',
      'pug_debug_sources',
      'pug_html'
    ];

    var exports = generateCode;
    exports.CodeGenerator = Compiler;

    function generateCode(ast, options){
      return (new Compiler(ast, options)).compile();
    }


    function isConstant(src){
      return constantinople(src, {pug: runtime, 'pug_interp': undefined});
    }

    function toConstant(src){
      return constantinople.toConstant(src, {pug: runtime, 'pug_interp': undefined});
    }

    /**
     * Initialize `Compiler` with the given `node`.
     *
     * @param {Node} node
     * @param {Object} options
     * @api public
     */

    function Compiler(node, options){
      this.options = options = options || {};
      this.node = node;
      this.bufferedConcatenationCount = 0;
      this.hasCompiledDoctype = false;
      this.hasCompiledTag = false;
      this.pp = options.pretty || false;
      if (this.pp && typeof this.pp !== 'string'){
        this.pp = '  ';
      }
      this.debug = false !== options.compileDebug;
      this.indents = 0;
      this.parentIndents = 0;
      this.terse = false;
      this.mixins = {};
      this.dynamicMixins = false;
      this.eachCount = 0;
      if (options.doctype) this.setDoctype(options.doctype);
      this.runtimeFunctionsUsed = [];
      this.inlineRuntimeFunctions = options.inlineRuntimeFunctions || false;
      if (this.debug && this.inlineRuntimeFunctions){
        this.runtimeFunctionsUsed.push('rethrow');
      }
    };

    /**
     * Compiler prototype.
     */

    Compiler.prototype = {

      runtime: function(name){
        if (this.inlineRuntimeFunctions){
          this.runtimeFunctionsUsed.push(name);
          return 'pug_' + name;
        } else {
          return 'pug.' + name;
        }
      },

      error: function(message, code, node){
        var err = new Error(code, message, {
          line: node.line,
          column: node.column,
          filename: node.filename
        });
        throw err;
      },

      /**
       * Compile parse tree to JavaScript.
       *
       * @api public
       */

      compile: function(){
        this.buf = [];
        if (this.pp) this.buf.push("var pug_indent = [];");
        this.lastBufferedIdx = -1;
        this.visit(this.node);
        if (!this.dynamicMixins){
          // if there are no dynamic mixins we can remove any un-used mixins
          var mixinNames = Object.keys(this.mixins);
          for (var i = 0; i < mixinNames.length; i++){
            var mixin = this.mixins[mixinNames[i]];
            if (!mixin.used){
              for (var x = 0; x < mixin.instances.length; x++){
                for (var y = mixin.instances[x].start; y < mixin.instances[x].end; y++){
                  this.buf[y] = '';
                }
              }
            }
          }
        }
        var js = this.buf.join('\n');
        var globals = this.options.globals ? this.options.globals.concat(INTERNAL_VARIABLES) : INTERNAL_VARIABLES;
        if (this.options.self){
          js = 'var self = locals || {};' + js;
        } else {
          js = addWith('locals || {}', js, globals.concat(this.runtimeFunctionsUsed.map(function(name){
            return 'pug_' + name;
          })));
        }
        if (this.debug){
          if (this.options.includeSources){
            js = 'var pug_debug_sources = ' + stringify(this.options.includeSources) + ';\n' + js;
          }
          js = 'var pug_debug_filename, pug_debug_line;' +
            'try {' +
            js +
            '} catch (err) {' +
            (this.inlineRuntimeFunctions ? 'pug_rethrow' : 'pug.rethrow') +
            '(err, pug_debug_filename, pug_debug_line' +
            (
              this.options.includeSources
                ? ', pug_debug_sources[pug_debug_filename]'
                : ''
            ) +
            ');' +
            '}';
        }
        return buildRuntime(this.runtimeFunctionsUsed) + 'function ' + (this.options.templateName || 'template') + '(locals) {var pug_html = "", pug_mixins = {}, pug_interp;' + js + ';return pug_html;}';
      },

      /**
       * Sets the default doctype `name`. Sets terse mode to `true` when
       * html 5 is used, causing self-closing tags to end with ">" vs "/>",
       * and boolean attributes are not mirrored.
       *
       * @param {string} name
       * @api public
       */

      setDoctype: function(name){
        this.doctype = doctypes[name.toLowerCase()] || '<!DOCTYPE ' + name + '>';
        this.terse = this.doctype.toLowerCase() == '<!doctype html>';
        this.xml = 0 == this.doctype.indexOf('<?xml');
      },

      /**
       * Buffer the given `str` exactly as is or with interpolation
       *
       * @param {String} str
       * @param {Boolean} interpolate
       * @api public
       */

      buffer: function(str){
        var self = this;

        str = stringify(str);
        str = str.substr(1, str.length - 2);

        if (this.lastBufferedIdx == this.buf.length && this.bufferedConcatenationCount < 100){
          if (this.lastBufferedType === 'code'){
            this.lastBuffered += ' + "';
            this.bufferedConcatenationCount++;
          }
          this.lastBufferedType = 'text';
          this.lastBuffered += str;
          this.buf[this.lastBufferedIdx - 1] = 'pug_html = pug_html + ' + this.bufferStartChar + this.lastBuffered + '";';
        } else {
          this.bufferedConcatenationCount = 0;
          this.buf.push('pug_html = pug_html + "' + str + '";');
          this.lastBufferedType = 'text';
          this.bufferStartChar = '"';
          this.lastBuffered = str;
          this.lastBufferedIdx = this.buf.length;
        }
      },

      /**
       * Buffer the given `src` so it is evaluated at run time
       *
       * @param {String} src
       * @api public
       */

      bufferExpression: function(src){
        if (isConstant(src)){
          return this.buffer(toConstant(src) + '')
        }
        if (this.lastBufferedIdx == this.buf.length && this.bufferedConcatenationCount < 100){
          this.bufferedConcatenationCount++;
          if (this.lastBufferedType === 'text') this.lastBuffered += '"';
          this.lastBufferedType = 'code';
          this.lastBuffered += ' + (' + src + ')';
          this.buf[this.lastBufferedIdx - 1] = 'pug_html = pug_html + (' + this.bufferStartChar + this.lastBuffered + ');';
        } else {
          this.bufferedConcatenationCount = 0;
          this.buf.push('pug_html = pug_html + (' + src + ');');
          this.lastBufferedType = 'code';
          this.bufferStartChar = '';
          this.lastBuffered = '(' + src + ')';
          this.lastBufferedIdx = this.buf.length;
        }
      },

      /**
       * Buffer an indent based on the current `indent`
       * property and an additional `offset`.
       *
       * @param {Number} offset
       * @param {Boolean} newline
       * @api public
       */

      prettyIndent: function(offset, newline){
        offset = offset || 0;
        newline = newline ? '\n' : '';
        this.buffer(newline + Array(this.indents + offset).join(this.pp));
        if (this.parentIndents)
          this.buf.push('pug_html = pug_html + pug_indent.join("");');
      },

      /**
       * Visit `node`.
       *
       * @param {Node} node
       * @api public
       */

      visit: function(node, parent){
        var debug = this.debug;

        if (!node){
          var msg;
          if (parent){
            msg = 'A child of ' + parent.type + ' (' + (parent.filename || 'Pug') + ':' + parent.line + ')';
          } else {
            msg = 'A top-level node';
          }
          msg += ' is ' + node + ', expected a Pug AST Node.';
          throw new TypeError(msg);
        }

        if (debug && node.debug !== false && node.type !== 'Block'){
          if (node.line){
            var js = ';pug_debug_line = ' + node.line;
            if (node.filename) js += ';pug_debug_filename = ' + stringify(node.filename);
            this.buf.push(js + ';');
          }
        }

        if (!this['visit' + node.type]){
          var msg;
          if (parent){
            msg = 'A child of ' + parent.type
          } else {
            msg = 'A top-level node';
          }
          msg += ' (' + (node.filename || 'Pug') + ':' + node.line + ')'
            + ' is of type ' + node.type + ','
            + ' which is not supported by pug-code-gen.'
          switch (node.type){
            case 'Filter':
              msg += ' Please use pug-filters to preprocess this AST.'
              break;
            case 'Extends':
            case 'Include':
            case 'NamedBlock':
            case 'FileReference': // unlikely but for the sake of completeness
              msg += ' Please use pug-linker to preprocess this AST.'
              break;
          }
          throw new TypeError(msg);
        }

        this.visitNode(node);
      },

      /**
       * Visit `node`.
       *
       * @param {Node} node
       * @api public
       */

      visitNode: function(node){
        return this['visit' + node.type](node);
      },

      /**
       * Visit case `node`.
       *
       * @param {Literal} node
       * @api public
       */

      visitCase: function(node){
        this.buf.push('switch (' + node.expr + '){');
        this.visit(node.block, node);
        this.buf.push('}');
      },

      /**
       * Visit when `node`.
       *
       * @param {Literal} node
       * @api public
       */

      visitWhen: function(node){
        if ('default' == node.expr){
          this.buf.push('default:');
        } else {
          this.buf.push('case ' + node.expr + ':');
        }
        if (node.block){
          this.visit(node.block, node);
          this.buf.push('  break;');
        }
      },

      /**
       * Visit literal `node`.
       *
       * @param {Literal} node
       * @api public
       */

      visitLiteral: function(node){
        this.buffer(node.str);
      },

      visitNamedBlock: function(block){
        return this.visitBlock(block);
      },
      /**
       * Visit all nodes in `block`.
       *
       * @param {Block} block
       * @api public
       */

      visitBlock: function(block){
        var escapePrettyMode = this.escapePrettyMode;
        var pp = this.pp;

        // Pretty print multi-line text
        if (pp && block.nodes.length > 1 && !escapePrettyMode &&
          block.nodes[0].type === 'Text' && block.nodes[1].type === 'Text'){
          this.prettyIndent(1, true);
        }
        for (var i = 0; i < block.nodes.length; ++i){
          // Pretty print text
          if (pp && i > 0 && !escapePrettyMode &&
            block.nodes[i].type === 'Text' && block.nodes[i - 1].type === 'Text' &&
            /\n$/.test(block.nodes[i - 1].val)){
            this.prettyIndent(1, false);
          }
          this.visit(block.nodes[i], block);
        }
      },

      /**
       * Visit a mixin's `block` keyword.
       *
       * @param {MixinBlock} block
       * @api public
       */

      visitMixinBlock: function(block){
        if (this.pp) this.buf.push("pug_indent.push('" + Array(this.indents + 1).join(this.pp) + "');");
        this.buf.push('block && block();');
        if (this.pp) this.buf.push("pug_indent.pop();");
      },

      /**
       * Visit `doctype`. Sets terse mode to `true` when html 5
       * is used, causing self-closing tags to end with ">" vs "/>",
       * and boolean attributes are not mirrored.
       *
       * @param {Doctype} doctype
       * @api public
       */

      visitDoctype: function(doctype){
        if (doctype && (doctype.val || !this.doctype)){
          this.setDoctype(doctype.val || 'html');
        }

        if (this.doctype) this.buffer(this.doctype);
        this.hasCompiledDoctype = true;
      },

      /**
       * Visit `mixin`, generating a function that
       * may be called within the template.
       *
       * @param {Mixin} mixin
       * @api public
       */

      visitMixin: function(mixin){
        var name = 'pug_mixins[';
        var args = mixin.args || '';
        var block = mixin.block;
        var attrs = mixin.attrs;
        var attrsBlocks = this.attributeBlocks(mixin.attributeBlocks);
        var pp = this.pp;
        var dynamic = mixin.name[0] === '#';
        var key = mixin.name;
        if (dynamic) this.dynamicMixins = true;
        name += (dynamic ? mixin.name.substr(2, mixin.name.length - 3) : '"' + mixin.name + '"') + ']';

        this.mixins[key] = this.mixins[key] || {used: false, instances: []};
        if (mixin.call){
          this.mixins[key].used = true;
          if (pp) this.buf.push("pug_indent.push('" + Array(this.indents + 1).join(pp) + "');")
          if (block || attrs.length || attrsBlocks.length){

            this.buf.push(name + '.call({');

            if (block){
              this.buf.push('block: function(){');

              // Render block with no indents, dynamically added when rendered
              this.parentIndents++;
              var _indents = this.indents;
              this.indents = 0;
              this.visit(mixin.block, mixin);
              this.indents = _indents;
              this.parentIndents--;

              if (attrs.length || attrsBlocks.length){
                this.buf.push('},');
              } else {
                this.buf.push('}');
              }
            }

            if (attrsBlocks.length){
              if (attrs.length){
                var val = this.attrs(attrs);
                attrsBlocks.unshift(val);
              }
              if (attrsBlocks.length > 1){
                this.buf.push('attributes: ' + this.runtime('merge') + '([' + attrsBlocks.join(',') + '])');
              } else {
                this.buf.push('attributes: ' + attrsBlocks[0]);
              }
            } else if (attrs.length){
              var val = this.attrs(attrs);
              this.buf.push('attributes: ' + val);
            }

            if (args){
              this.buf.push('}, ' + args + ');');
            } else {
              this.buf.push('});');
            }

          } else {
            this.buf.push(name + '(' + args + ');');
          }
          if (pp) this.buf.push("pug_indent.pop();")
        } else {
          var mixin_start = this.buf.length;
          args = args ? args.split(',') : [];
          var rest;
          if (args.length && /^\.\.\./.test(args[args.length - 1].trim())){
            rest = args.pop().trim().replace(/^\.\.\./, '');
          }
          // we need use pug_interp here for v8: https://code.google.com/p/v8/issues/detail?id=4165
          // once fixed, use this: this.buf.push(name + ' = function(' + args.join(',') + '){');
          this.buf.push(name + ' = pug_interp = function(' + args.join(',') + '){');
          this.buf.push('var block = (this && this.block), attributes = (this && this.attributes) || {};');
          if (rest){
            this.buf.push('var ' + rest + ' = [];');
            this.buf.push('for (pug_interp = ' + args.length + '; pug_interp < arguments.length; pug_interp++) {');
            this.buf.push('  ' + rest + '.push(arguments[pug_interp]);');
            this.buf.push('}');
          }
          this.parentIndents++;
          this.visit(block, mixin);
          this.parentIndents--;
          this.buf.push('};');
          var mixin_end = this.buf.length;
          this.mixins[key].instances.push({start: mixin_start, end: mixin_end});
        }
      },

      /**
       * Visit `tag` buffering tag markup, generating
       * attributes, visiting the `tag`'s code and block.
       *
       * @param {Tag} tag
       * @param {boolean} interpolated
       * @api public
       */

      visitTag: function(tag, interpolated){
        this.indents++;
        var name = tag.name
          , pp = this.pp
          , self = this;

        function bufferName(){
          if (interpolated) self.bufferExpression(tag.expr);
          else self.buffer(name);
        }

        if (WHITE_SPACE_SENSITIVE_TAGS[tag.name] === true) this.escapePrettyMode = true;

        if (!this.hasCompiledTag){
          if (!this.hasCompiledDoctype && 'html' == name){
            this.visitDoctype();
          }
          this.hasCompiledTag = true;
        }

        // pretty print
        if (pp && !tag.isInline)
          this.prettyIndent(0, true);
        if (tag.selfClosing || (!this.xml && selfClosing[tag.name])){
          this.buffer('<');
          bufferName();
          this.visitAttributes(tag.attrs, this.attributeBlocks(tag.attributeBlocks));
          if (this.terse && !tag.selfClosing){
            this.buffer('>');
          } else {
            this.buffer('/>');
          }
          // if it is non-empty throw an error
          if (tag.code ||
            tag.block &&
            !(tag.block.type === 'Block' && tag.block.nodes.length === 0) &&
            tag.block.nodes.some(function(tag){
              return tag.type !== 'Text' || !/^\s*$/.test(tag.val)
            })){
            this.error(name + ' is a self closing element: <' + name + '/> but contains nested content.', 'SELF_CLOSING_CONTENT', tag);
          }
        } else {
          // Optimize attributes buffering
          this.buffer('<');
          bufferName();
          this.visitAttributes(tag.attrs, this.attributeBlocks(tag.attributeBlocks));
          this.buffer('>');
          if (tag.code) this.visitCode(tag.code);
          this.visit(tag.block, tag);

          // pretty print
          if (pp && !tag.isInline && WHITE_SPACE_SENSITIVE_TAGS[tag.name] !== true && !tagCanInline(tag))
            this.prettyIndent(0, true);

          this.buffer('</');
          bufferName();
          this.buffer('>');
        }

        if (WHITE_SPACE_SENSITIVE_TAGS[tag.name] === true) this.escapePrettyMode = false;

        this.indents--;
      },

      /**
       * Visit InterpolatedTag.
       *
       * @param {InterpolatedTag} tag
       * @api public
       */

      visitInterpolatedTag: function(tag){
        return this.visitTag(tag, true);
      },

      /**
       * Visit `text` node.
       *
       * @param {Text} text
       * @api public
       */

      visitText: function(text){
        this.buffer(text.val);
      },

      /**
       * Visit a `comment`, only buffering when the buffer flag is set.
       *
       * @param {Comment} comment
       * @api public
       */

      visitComment: function(comment){
        if (!comment.buffer) return;
        if (this.pp) this.prettyIndent(1, true);
        this.buffer('<!--' + comment.val + '-->');
      },

      /**
       * Visit a `YieldBlock`.
       *
       * This is necessary since we allow compiling a file with `yield`.
       *
       * @param {YieldBlock} block
       * @api public
       */

      visitYieldBlock: function(block){
      },

      /**
       * Visit a `BlockComment`.
       *
       * @param {Comment} comment
       * @api public
       */

      visitBlockComment: function(comment){
        if (!comment.buffer) return;
        if (this.pp) this.prettyIndent(1, true);
        this.buffer('<!--' + (comment.val || ''));
        this.visit(comment.block, comment);
        if (this.pp) this.prettyIndent(1, true);
        this.buffer('-->');
      },

      /**
       * Visit `code`, respecting buffer / escape flags.
       * If the code is followed by a block, wrap it in
       * a self-calling function.
       *
       * @param {Code} code
       * @api public
       */

      visitCode: function(code){
        // Wrap code blocks with {}.
        // we only wrap unbuffered code blocks ATM
        // since they are usually flow control

        // Buffer code
        if (code.buffer){
          var val = code.val.trim();
          val = 'null == (pug_interp = ' + val + ') ? "" : pug_interp';
          if (code.mustEscape !== false) val = this.runtime('escape') + '(' + val + ')';
          this.bufferExpression(val);
        } else {
          this.buf.push(code.val);
        }

        // Block support
        if (code.block){
          if (!code.buffer) this.buf.push('{');
          this.visit(code.block, code);
          if (!code.buffer) this.buf.push('}');
        }
      },

      /**
       * Visit `Conditional`.
       *
       * @param {Conditional} cond
       * @api public
       */

      visitConditional: function(cond){
        var test = cond.test;
        this.buf.push('if (' + test + ') {');
        this.visit(cond.consequent, cond);
        this.buf.push('}')
        if (cond.alternate){
          if (cond.alternate.type === 'Conditional'){
            this.buf.push('else')
            this.visitConditional(cond.alternate);
          } else {
            this.buf.push('else {');
            this.visit(cond.alternate, cond);
            this.buf.push('}');
          }
        }
      },

      /**
       * Visit `While`.
       *
       * @param {While} loop
       * @api public
       */

      visitWhile: function(loop){
        var test = loop.test;
        this.buf.push('while (' + test + ') {');
        this.visit(loop.block, loop);
        this.buf.push('}');
      },

      /**
       * Visit `each` block.
       *
       * @param {Each} each
       * @api public
       */

      visitEach: function(each){
        var indexVarName = each.key || 'pug_index' + this.eachCount;
        this.eachCount++;

        this.buf.push(''
          + '// iterate ' + each.obj + '\n'
          + ';(function(){\n'
          + '  var $$obj = ' + each.obj + ';\n'
          + '  if (\'number\' == typeof $$obj.length) {');

        if (each.alternate){
          this.buf.push('    if ($$obj.length) {');
        }

        this.buf.push(''
          + '      for (var ' + indexVarName + ' = 0, $$l = $$obj.length; ' + indexVarName + ' < $$l; ' + indexVarName + '++) {\n'
          + '        var ' + each.val + ' = $$obj[' + indexVarName + '];');

        this.visit(each.block, each);

        this.buf.push('      }');

        if (each.alternate){
          this.buf.push('    } else {');
          this.visit(each.alternate, each);
          this.buf.push('    }');
        }

        this.buf.push(''
          + '  } else {\n'
          + '    var $$l = 0;\n'
          + '    for (var ' + indexVarName + ' in $$obj) {\n'
          + '      $$l++;\n'
          + '      var ' + each.val + ' = $$obj[' + indexVarName + '];');

        this.visit(each.block, each);

        this.buf.push('    }');
        if (each.alternate){
          this.buf.push('    if ($$l === 0) {');
          this.visit(each.alternate, each);
          this.buf.push('    }');
        }
        this.buf.push('  }\n}).call(this);\n');
      },

      /**
       * Visit `attrs`.
       *
       * @param {Array} attrs
       * @api public
       */

      visitAttributes: function(attrs, attributeBlocks){
        if (attributeBlocks.length){
          if (attrs.length){
            var val = this.attrs(attrs);
            attributeBlocks.unshift(val);
          }
          if (attributeBlocks.length > 1){
            this.bufferExpression(this.runtime('attrs') + '(' + this.runtime('merge') + '([' + attributeBlocks.join(',') + ']), ' + stringify(this.terse) + ')');
          } else {
            this.bufferExpression(this.runtime('attrs') + '(' + attributeBlocks[0] + ', ' + stringify(this.terse) + ')');
          }
        } else if (attrs.length){
          this.attrs(attrs, true);
        }
      },

      /**
       * Compile attributes.
       */

      attrs: function(attrs, buffer){
        var res = compileAttrs(attrs, {
          terse: this.terse,
          format: buffer ? 'html' : 'object',
          runtime: this.runtime.bind(this)
        });
        if (buffer){
          this.bufferExpression(res);
        }
        return res;
      },

      /**
       * Compile attribute blocks.
       */
      attributeBlocks: function(attributeBlocks){
        return attributeBlocks && attributeBlocks.slice().map(function(attrBlock){
          return attrBlock.val;
        });
      }
    };

    function tagCanInline(tag){
      function isInline(node){
        // Recurse if the node is a block
        if (node.type === 'Block') return node.nodes.every(isInline);
        // When there is a YieldBlock here, it is an indication that the file is
        // expected to be included but is not. If this is the case, the block
        // must be empty.
        if (node.type === 'YieldBlock') return true;
        return (node.type === 'Text' && !/\n/.test(node.val)) || node.isInline;
      }

      return tag.block.nodes.every(isInline);
    }

    return exports;
  });

define(['module', 'pug-lexer', 'pug-parser', 'pug-code-gen', 'pug-wrap'],
  function(module, lexer, parser, generator, wrapper){
    return {
      render: function(template){
        return wrapper(generator(parser(lexer(template)), {compileDebug: false, pretty: false}))();
      }
    }
  }
);