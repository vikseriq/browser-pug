# browser-pug

[AMD module](http://requirejs.org/docs/whyamd.html) for [pug](https://pugjs.org) (ex. `jade`) template rendering. Works on browser 💪.

Based on original [Pug modules](https://github.com/pugjs) with hand-picked dependencies.
Features not supported: `include` and inline variable interpolations.

## Demo on [jsfiddle](https://jsfiddle.net/vikseriq/97r0xg9y/)

## Install

```bash
yarn add browser-pug
# or
npm install --save browser-pug
```

## Usage

### With RequireJS

Firstly include `require.js` onto project or page and specify package path, like:

```html
<script src="https://unpkg.com/requirejs@2.3.5/require.js"></script>
<script>
require({
  paths: {
    'browser-pug': 'https://unpkg.com/browser-pug@0.1.0/browser-pug'
  }
}, ['browser-pug']);
</script>
```

Then use as usual AMD module:

```js
require(['browser-pug'], function(pug){
  var html = pug.render('div\n\th2 Listen, Morty\n\th1 Focus on science!');
  console.log('Rick say', html);
});
```

Or with in-place `require`:

```js
    ...
    var pug = require('browser-pug');
    var html = pug.render('div it is pug template');
    ...
```

### With Vue templates


#### Basic Vue demo on [jsfiddle](https://jsfiddle.net/vikseriq/oxhcg8y1/)


Module used as optional dependency for [requirejs-vue](github.com/vikseriq/requirejs-vue) loader.
When loader find .vue file with `<template lang="pug">` it loads this module and interpolates
pug template into html template.

For Vue binding in template use full form or backslash with shorthands, i.e.:

```pug
div
	a(v-bind:href="dummyLink" v-on:click="alert") This is binding
	|
	a(\:href="dummyLink" \@click="alert") And that is shorthand form
		|  with
		code backslash
		|  .
```

Keep an eye to wrap Vue data/methods with backquotes, otherwise it will parsed as pug's variable
and produces unexpected result.

*Note: due intended optional dependency this module should be listed in requirejs config under original name.*

### In browser globals, r.js or CommonJS modules

Currently not supported.

## Motivation

On my pet projects I bored of two things:

1. setup every time all those `webpack`s and other modern stuff - it is overhead for *really tiny proof-of-concept projects*;
2. write a bunch of open-closing tags.

I realized that there are no pure AMD libraries, which can translate pug markup to html and
not requires ~500Kb extra payload for simplest routine "parse tabs and place tags".
Instead of *lazy assing* ([like yo, тиджей](https://github.com/pugjs/pug/issues/634#issuecomment-5640009))
I crafted PoC and happily use it across various projects.

You feel free to use it in your pet projects.
Keep in mind that this lib still not ready for production,
use at your own risk, Morty.

## License

MIT &copy; 2017 vikseriq