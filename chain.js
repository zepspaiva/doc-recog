function Chain(d, c) {
	
	this.funcs = [];

	if (d instanceof Chain) {
		this.data = d.data || {};
		this.context = d.context || {};
	} else {
		this.data = d || {};
		this.context = c || {};
	}

}

Chain.methods = function(methods) {
	Object.keys(methods).forEach(function(method) {
		Chain.register(method, methods[method]);
	});
}

var allMethods = []

Chain.allMethods = function() {
	return allMethods
}

Chain.parse = function(expression, data) {
	var c = new Chain(data);
	return eval(expression.replace('.done()', '.spec()'));
}

Chain.StopChainErr = new Error("Chain was stopped.");

Chain.prototype.done = function() {
	
	var self = this;
	var last = this.data || {};
	var context = this.context || {};
	var lastIdx = this.funcs.length -1;
	var reduced = null;

	try {
    	
    	reduced = this.funcs.reduce(function(last, chainItem, index) {
    		return chainItem.func(self.data, chainItem.args, last, context);
    	}, last);

    } catch(err) {
    	if (err != Chain.StopChainErr) {
    		console.log('Chain ERR:', err);
    	}
	}
    
   	this.funcs = []
    return reduced;

}

Chain.prototype.spec = function() {

	var specs = [];
	var self = this;
	
	return this.funcs.map(function(chainItem) {
		return { name: chainItem.method, args: chainItem.args }
	});

};

Chain.register = function(method, body) {

	if (Chain.prototype[method])
		throw new Error('Cannot redefine reactor method: ' + method);

	Chain.prototype[method] = function() {
		var args = Array.prototype.slice.call(arguments, 0);
		this.funcs.push({
			method: method,
			args: args,
			func: body
		});
		return this
  	};

  	allMethods.push(method);
};

// ===

var newFunc = function(data, args, last) {
	
	return new Chain(data);

}

var logFunc = function(data, args, last) {

	console.log(last);
	return last;

};

var logContextFunc = function(data, args, last, context) {

	console.log(context);
	return last;

};

var setContextVarFunc = function(data, args, last, context) {

	var varname = args[0];
	context[varname] = last;
	return last;

};

var getContextVarFunc = function(data, args, last, context) {

	var varname = args[0];
	return context[varname];

};

var appendContextVarFunc = function(data, args, last, context) {

	var varname = args[0];

	if (!context[varname])
		context[varname] = [];
	else if (Array.isArray(context[varname]))
		context[varname] = [context[varname]];

	context[varname].push(last);

	return last;

};

var locateFunc = function(data, args, last) {

	var foundwords = [];
	var words = last;

	var xmin = args[0];
	var ymin = args[1];
	var xdev = args[2];
	var ydev = args[3];

	var locatefn = function(x, y) {
		return x >= xmin - xdev &&
			   x <= xmin + xdev &&
			   y >= ymin - ydev &&
			   y <= ymin + ydev;
	}

	for (w in words) {
		var word = words[w];
		var wxmin = word['xmin'];
		var wymin = word['ymin'];

		if (locatefn(wxmin, wymin)) foundwords.push(word);
	}

	return foundwords;

};

var getPageFunc = function(data, args, last, context) {

	var pagenum = args[0];
	if (!pagenum) throw Chain.StopChainErr;

	var pages = last['pages'];
	if (!pages) throw Chain.StopChainErr;

	var page = pages[pagenum-1];
	if (!page) throw Chain.StopChainErr;

	context['pagenum'] = pagenum;

	return page;

};

var getWordsFunc = function(data, args, last, context) {

	if (!last['words']) throw Chain.StopChainErr;
	return last['words'];

};

var getTextFunc = function(data, args, last, context) {
	return last['text'];
}

var removeNonDigitsFunc = function(data, args, last, context) {
	return last.replace(/[^0-9]*/gi, '');
}

var removeTextNonDigitsFunc = function(data, args, last, context) {
	last['text'] = last['text'].replace(/[^0-9]*/gi, '');
	return last;
}

var anyTextFunc = function(data, args, last) {

	if (!Array.isArray(last) || !last.length)
		return false;
		//throw Chain.StopChainErr;

	var value = args[0];
	var found = false;
	var i = 0;

	while (!found && i < last.length) {
		var word = last[i++];
		var text = word['text'];
		found = text === value ? word : false;
	}

	return found;

}

var notFunc = function(data, args, last) {

	return !last;

}

var rightFunc = function(data, args, last, context) {

	var xmax = last['xmax'];
	var ymax = last['ymax'];
	var pagenum = context['pagenum'];

	var foundwords = [];
	var words = new Chain(data).getPage(pagenum).done()['words'];

	var rightfn = function(x, y) {
		return x >= xmax;
	}

	for (w in words) {
		var word = words[w];
		var wxmin = word['xmin'];
		var wymax = word['ymax'];

		if (rightfn(wxmin, wymax)) foundwords.push(word);
	}

	if (!foundwords.length) throw Chain.StopChainErr;

	foundwords.sort(function(a, b) {
		var aydiff = a['ymin'] - ymax;
		var bydiff = b['ymin'] - ymax;
		if (aydiff < bydiff)
			return -1;
		else if (aydiff > bydiff)
			return 1;
		else
			return 0;
	});

	return foundwords[0];

}

var belowFunc = function(data, args, last, context) {

	var xmin = last['xmin'];
	var ymax = last['ymax'];
	var pagenum = context['pagenum'];

	var foundwords = [];
	var words = new Chain(data).getPage(pagenum).done()['words'];

	var belowfn = function(wxmin, wymin) {
		return wymin >= ymax;
	}

	for (w in words) {
		var word = words[w];
		var wxmin = word['xmin'];
		var wymin = word['ymin'];

		if (belowfn(wxmin, wymin)) foundwords.push(word);
	}

	if (!foundwords.length) throw Chain.StopChainErr;

	var distfn = function(x1, y1, x2, y2) {
		var a = x1 - x2
		var b = y1 - y2
		return Math.sqrt(a*a + b*b);
	}

	foundwords.sort(function(a, b) {
		var adist = distfn(a['xmin'], a['ymin'], xmin, ymax);
		var bdist = distfn(b['xmin'], b['ymin'], xmin, ymax);
		if (adist < bdist)
			return -1;
		else if (adist > bdist)
			return 1;
		else
			return 0;
	});

	return foundwords[0];

}

// ===

Chain.methods({

	new: newFunc,

	log: logFunc,
	not: notFunc,

	logContext: logContextFunc,
	setContextVar: setContextVarFunc,
	getContextVar: getContextVarFunc,
	appendContextVar: appendContextVarFunc,

	getPage: getPageFunc,
	getWords: getWordsFunc,
	locate: locateFunc,
	anyText: anyTextFunc,

	right: rightFunc,
	below: belowFunc,

	getText: getTextFunc,
	removeNonDigits: removeNonDigitsFunc,

	removeTextNonDigits: removeTextNonDigitsFunc

});

module.exports = Chain;