
const TestFunction = Function;

class Script {
	
	constructor(code, options) {
		this._code = String(code);
		TestFunction('"use strict";'+code);
	}
	
	runInContext(contextifiedSandbox, options) {
		return contextifiedSandbox.eval(this._code);
	}
	
};

function init(iframe, allowEval, strictMode, asyncAllowed, wasmAllowed) {
	'use strict';
	const stdlib = [
		'Object',
		//'Function',
		'Array',
		'Number',
		'parseFloat',
		'parseInt',
		'Infinity',
		'NaN',
		'undefined',
		'Boolean',
		'String',
		'Symbol',
		'Date',
		'Promise',
		'RegExp',
		'Error',
		'EvalError',
		'RangeError',
		'ReferenceError',
		'SyntaxError',
		'TypeError',
		'URIError',
		'JSON',
		'Math',
		//'console',
		'Intl',
		'ArrayBuffer',
		'Uint8Array',
		'Int8Array',
		'Uint16Array',
		'Int16Array',
		'Uint32Array',
		'Int32Array',
		'Float32Array',
		'Float64Array',
		'Uint8ClampedArray',
		'BigUint64Array',
		'BigInt64Array',
		'DataView',
		'Map',
		'BigInt',
		'Set',
		'WeakMap',
		'WeakSet',
		'Proxy',
		'Reflect',
		'decodeURI',
		'decodeURIComponent',
		'encodeURI',
		'encodeURIComponent',
		'escape',
		'unescape',
		//'eval',
		'isFinite',
		'isNaN',
		'SharedArrayBuffer',
		'Atomics',
		//'globalThis',
		'WebAssembly'
	];
	const realGlobal = gthis;
	const {Function, eval: eval_, Array, RegExp, Proxy, Promise, Object, Symbol, ReferenceError, Reflect, EvalError, SyntaxError} = realGlobal;
	const {join, pop} = Array.prototype;
	const {test} = RegExp.prototype;
	const {setPrototypeOf, defineProperty, getOwnPropertyNames, getOwnPropertyDescriptor} = Object;
	const {unscopables} = Symbol;
	const {apply: rApply, set: rSet} = Reflect;
	
	function getOrUndefined(code) {
		try{
			return eval_(code);
		}catch(ex){}
	}
	
	const GeneratorFunction = getOrUndefined('(function*(){}).constructor');
	const AsyncFunction = getOrUndefined('(async function(){}).constructor');
	const AsyncGeneratorFunction = getOrUndefined('(async function*(){}).constructor');
	
	const global = {};
	
	const consts = [];
	const fastAsks = ['Object'];
	const fasts = [];
	let i;
	for(i=0; i<fastAsks.length; i++){
		const key = fastAsks[i];
		let desc
		const j = stdlib.indexOf(key);
		if(j===-1){
			fasts.push(key);
			continue;
		}else{
			stdlib[j] = '';
			desc = getOwnPropertyDescriptor(realGlobal, key);
			if (!desc || desc.get || desc.set) {
				fasts.push(key);
				continue;
			}
		}
		if (!desc.writable && !desc.configurable) {
			// These properties are not writeable and so
			// we can optimise them by defining them as const
			consts.push(key);
			defineProperty(global, key, desc);
		} else {
			fasts.push(key);
		}
	}
	for(i=0; i<stdlib.length; i++){
		const key = stdlib[i];
		if (!key)
			continue;
		const desc = getOwnPropertyDescriptor(realGlobal, key);
		if (desc) {
			defineProperty(global, key, desc);
			if (!desc.writable && !desc.configurable) {
				// These properties are not writeable and so
				// we can optimise them by defining them as const
				consts.push(key);
			}
		}
	}
	
	const optimiseCode = (consts.length === 0 ? '' : 'const {'+consts.join(',')+'}=this;')+
		(fasts.length === 0 ? '' : 'let '+fasts.join(',')+';');
	
	let allowEvalForEntry = false;
	const strictGlobalProxyHandler = {
		__proto__: null,
		get(target, key) {
			if (key === 'eval') {
				if (allowEvalForEntry) {
					allowEvalForEntry = false;
					return eval_;
				}
			}else if (key === unscopables) {
				return undefined;
			}
			if(key in global)
				return global[key];
			throw new ReferenceError(key + ' is not defined');
		},
		has(target, key) {
			return key in global || key in realGlobal || key === 'eval';
		},
		set(target, key, value) {
			if (!(key in global))
				throw new ReferenceError(key + ' is not defined');
			global[key] = value;
			return true;
		}
	};
	const sloppyGlobalProxyHandler = {
		__proto__: null,
		get(target, key) {
			if (key === 'eval') {
				if (allowEvalForEntry) {
					allowEvalForEntry = false;
					return eval_;
				}
			}else if (key === unscopables) {
				return undefined;
			}
			return global[key];
		},
		has(target, key) {
			return true;
		},
		set(target, key, value) {
			rSet(global, key, value);
			return true;
		}
	};
	const proxyTarget = Object.create(null);
	const sloppyGlobals = new Proxy(proxyTarget, sloppyGlobalProxyHandler);
	const strictGlobals = strictMode===0 ? sloppyGlobals : new Proxy(proxyTarget, strictGlobalProxyHandler);
	const sloppyEval = new Function('with(arguments[0]){return function(){"use strict";return eval(arguments[0]);}}')(sloppyGlobals);
	const strictEval = strictMode===0 ? sloppyEval : new Function('with(arguments[0]){'+optimiseCode+'return function(){"use strict";return eval(arguments[0]);}}')(strictGlobals);
	
	for(i=0; i<fasts.length; i++){
		const key = fasts[i];
		let value = undefined;
		const std = stdlib.includes(key);
		if(key){
			const desc = getOwnPropertyDescriptor(realGlobal, key);
			if (desc && !desc.get && !desc.set) {
				value = desc.value;
			}
		}
		allowEvalForEntry = true;
		const desc = strictEval('({get(){return '+key+';},set(value){'+key+'=value;},enumerable:false,configurable:false})');
		defineProperty(global, key, desc);
		global[key] = value;
	}
	
	function rejectAsync(){
		throw new SyntaxError('Async functions are disabled for this context');
	}
	
	function rejectEval(){
		throw new EvalError('Code generation from strings disallowed for this context');
	}
	
	const testAsync = setPrototypeOf(/\basync\b/, null);

	const checkAsync = asyncAllowed ? function checkAsync(source){
		return source
	} : function checkAsync(source){
		// Filter async functions, await can only be in them.
		if (rApply(test, testAsync, [source])) {
			throw rejectAsync();
		}
		return source;
	}
		
	const testStrict = setPrototypeOf(/('use strict'|"use strict")/, null);
	
	function isStrict(body) {
		return rApply(test, testStrict, [body]);
	}
	
	function outerEval(source) {
		checkAsync(source);
		const strict = isStrict(source);
		const func = strict ? strictEval : sloppyEval;
		try{
			allowEvalForEntry = true;
			return func(source);
		}finally{
			allowEvalForEntry = false;
		}
	}
	
	const sloppyFunctionHandler = {
		__proto__: null,
		apply(target, thiz, args) {
			return rApply(target, thiz === undefined ? global : thiz, args);
		}
	};
	
	const proxyFunction = allowEval ? function(ctor, name) {
		const initFunction = typeof name === 'string' ? function initFunction(args) {
			const body = args.length===0 ? '' : checkAsync('' + rApply(pop, args, []));
			const params = checkAsync(rApply(join, args, [',']));
			ctor(params, body); // This is just here to see if params & body are valid
			const strict = isStrict(body);
			const code = '('+ name + '(' + params + '){' + body + '})';
			if (strict) return strictEval(code);
			const func = sloppyEval(code);
			return new Proxy(func, sloppyFunctionHandler);
		} : name;
		const handler = {
			__proto__: null,
			apply(target, thiz, args) {
				return initFunction(args);
			},
			construct(target, args, newTarget) {
				return initFunction(args);
			}
		};
		return new Proxy(ctor, handler);
	}: function (ctor, name){
		const handler = {
			__proto__: null,
			apply: rejectEval,
			construct: rejectEval
		};
		return new Proxy(ctor, handler);
	}
	
	const evalProxyHandler = {
		__proto__: null,
		apply: allowEval? function apply(target, thiz, args) {
			if (args.length === 0)
				return undefined;
			const script = args[0];
			if (typeof script !== 'string')
				return script;
			return outerEval(script);
		}: rejectEval
	};
	
	function override(obj, prop, value) {
		const desc = getOwnPropertyDescriptor(obj, prop);
		desc.value = value;
		defineProperty(obj, prop, desc);
	}
	
	override(Function.prototype, 'constructor', proxyFunction(Function, 'function'));
	if(GeneratorFunction) override(GeneratorFunction.prototype, 'constructor', proxyFunction(GeneratorFunction, 'function*'));
	if(AsyncFunction) override(AsyncFunction.prototype, 'constructor', proxyFunction(AsyncFunction, asyncAllowed ? 'async function' : rejectAsync));
	if(AsyncGeneratorFunction) override(AsyncGeneratorFunction.prototype, 'constructor', proxyFunction(AsyncGeneratorFunction, asyncAllowed ? 'async function*' : rejectAsync));

	if(!asyncAllowed && Promise){
		const AsyncRejectHandler = {
			__proto__: null,
			apply: rejectAsync
		};
		Promise.prototype.then = new Proxy(Promise.prototype.then, AsyncRejectHandler);
		if(Promise.prototype.finally) Promise.prototype.finally = new Proxy(Promise.prototype.finally, AsyncRejectHandler);
		if(Promise.prototype.catch) Promise.prototype.catch = new Proxy(Promise.prototype.catch, AsyncRejectHandler);
	}
	
	Object.defineProperties(global, {
		Function: {
			value: Function.prototype.constructor,
			configurable: true,
			writeable: true,
			enumerable: false
		},
		eval: {
			value: new Proxy(eval, evalProxyHandler),
			configurable: true,
			writeable: true,
			enumerable: false
		},
		globalThis: {
			value: global,
			configurable: true,
			writeable: true,
			enumerable: false
		}
	});
	return {__proto__: null, global, eval: outerEval};
}

function createContext(sandbox, options = {}) {
	const gen = options.codeGeneration || {};
	const {strings, wasm} = gen;
	const iframe = document.createElement('iframe');
	iframe.style.display = 'none';
	document.body.appendChild(iframe);
	return iframe.contentWindow.eval('const gthis=this;('+init+')')(iframe, strings === undefined || strings, 1, false, wasm === undefined || wasm);
}

function getGlobal(context) {
	return context.global;
}

exports.Script = Script;
exports.createContext = createContext;
exports.disposeContext = (context) => {
	document.body.removeChild(context);
}
exports.getGlobal = getGlobal;
exports.runInContext = (code, context, options) => {
	return new Script(code).runInContext(context, options);
}