# browser-pug

AMD module for [pug](https://pugjs.org) template rendering. Works on browser 💪.

Based on original [Pug modules](https://github.com/pugjs) with hand-picked dependencies.
Features not supported: `include` and inline variable interpolations.

## Install

```bash
yarn add browser-pug
# or
npm install --save browser-pug
```

## Usage

### With RequireJS

```js
require(['browser-pug'], function(pug){
  var html = pug.render('div\n\th2 Listen, Morty\n\th1 Focus on science!');
  console.log('Rick say', html);
});
```

### With Vue templates

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

You feel free to use it in your pet projects. Keep in mind that this lib still not ready for production.

## License

MIT &copy; 2017 vikseriq