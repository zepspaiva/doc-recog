var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var im = require('imagemagick');
var uuid = require('uuid');
var deasync = require("deasync");

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

var allTextsFunc = function(data, args, last) {

	if (!Array.isArray(last) || !last.length)
		return false;
		//throw Chain.StopChainErr;

	var value = args[0];
	var found = [];
	var i = 0;

	while (i < last.length) {
		var word = last[i++];
		var text = word['text'];
		if (text === value) found.push(word);
	}

	return found;

}

var sameLineTextsFunc = function(data, args, last, context) {

	var foundwords = [];

	var lastymin = last['ymin'];
	var lastymax = last['ymax'];
	var pagenum = context['pagenum'];

	var words = new Chain(data).getPage(pagenum).done()['words'];

	var samelinefn = function(ymin, ymax) {
		return (ymin <= lastymin && ymax >= lastymin) ||
			   (ymin >= lastymin && ymin <= lastymax);
	}

	for (w in words) {
		var word = words[w];
		var wymin = word['ymin'];
		var wymax = word['ymax'];

		if (samelinefn(wymin, wymax)) foundwords.push(word);
	}

	if (!foundwords.length) throw Chain.StopChainErr;

	foundwords.sort(function(a, b) {

		var x1 = a['xmin'];
		var x2 = b['xmin'];

		if (x1 < x2)
			return -1;
		else if (x1 > x2)
			return 1;
		else
			return 0;

	});

	return foundwords;

}

var concatTextsFunc = function(data, args, last) {

	var xmin = -1;
	var ymin = -1;
	var xmax = -1;
	var ymax = -1;
	var text = '';

	if (!Array.isArray(last)) last = [last];

	last.sort(function(a, b) {
		var ax = a['xmin'];
		var ay = a['ymin'];
		var bx = b['xmin'];
		var by = b['ymin'];

		if (ay < by)
			return -1;
		else if (ay > by)
			return 1;
		else if (ax < bx)
			return -1;
		else if (ax > bx)
			return 1;
		else
			return 0;

	});

	last.forEach(function(word) {
		xmin = xmin == -1 ? word['xmin'] : word['xmin'] < xmin ? word['xmin'] : xmin;
		ymin = ymin == -1 ? word['ymin'] : word['ymin'] < ymin ? word['ymin'] : ymin;
		xmax = xmax == -1 ? word['xmax'] : word['xmax'] > xmax ? word['xmax'] : xmax;
		ymax = ymax == -1 ? word['ymax'] : word['ymax'] > ymax ? word['ymax'] : ymax;
		text = text ? [text, word['text']].join(' ') : word['text'];
	});

	return {
		'xmin': xmin,
		'ymin': ymin,
		'xmax': xmax,
		'ymax': ymax,
		'text': text
	};

}

var notFunc = function(data, args, last) {

	return !last;

}

var firstFunc = function(data, args, last) {

	return last[0];

}

var rightFunc = function(data, args, last, context) {

	if (!Array.isArray(last)) last = [last];

	var foundwords = [];

	last.forEach(function(keyword) {

		var xmax = keyword['xmax'];
		var ymax = keyword['ymax'];
		var ymin = keyword['ymin'];
		var ymed = (ymax - ymin)/2 + ymin;
		var pagenum = context['pagenum'];

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

		foundwords.sort(function(a, b) {

			var x1 = a['xmin'];
			var y1 = (a['ymax']-a['ymin'])/2 + a['ymin'];
			var x2 = b['xmin'];
			var y2 = (b['ymax']-b['ymin'])/2 + b['ymin'];

			var d1 = Math.sqrt((xmax-x1)*(xmax-x1) + (ymed-y1)*(ymed-y1));
			var d2 = Math.sqrt((xmax-x2)*(xmax-x2) + (ymed-y2)*(ymed-y2));

			if (d1 < d2)
				return -1;
			else if (d1 > d2)
				return 1;
			else
				return 0;

		});

	});

	if (!foundwords.length) throw Chain.StopChainErr;

	// Remove duplicates
	foundwords = _.uniq(foundwords, function(w) {
		return [w['text'], w['xmin'], w['ymin'], w['xmax'], w['ymax']].join('-');
	})

	return foundwords;

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

	return foundwords;

}

var cropGrayLevelFunc = function(data, args, last, context) {

	var params = args[0];
	params.pagenum = context['pagenum'] - 1 || 0;
	
	var getGrayLevel = deasync(function(params, cb) {

		var calcGrayLevelFn = function(params, features, cb) {

			var width = features.width;
			var height = features.height;

			var xmin = params.xmin * width;
			var xmax = params.xmax * width;
			var ymin = params.ymin * height;
			var ymax = params.ymax * height;

			var cropwidth = xmax - xmin;
			var cropheight = ymax - ymin;

			var cropgraylevelparams = [params.pngfilepath, '-crop', [cropwidth + 'x' + cropheight, xmin, ymin].join('+'), '-filter', 'box', '-resize', '1x1!', '-format', '"%[fx:u]"', 'info:'];

			im.convert(cropgraylevelparams, function(err, stdout) {
				if (err) { return cb(err); }

				try {
					cb(null, parseFloat(stdout.replace(/\"/, '')));
				} catch (err) {
					cb(err);
				}

			});

		};

		var genPngFn = function(params, cb) {

			var pdftopngparams = [params.filepath + '[' + params.pagenum + ']', '-density', '72', params.pngfilepath];

			im.convert(pdftopngparams, function(err, stdout) {
				if (err) { return cb(err); }
				
				im.identify(params.pngfilepath, function(err, features) {
					if (err) { return cb(err); }

					cb(null, features);

				});

			});

		};

		params.pngfilepath = context.tempfiles ? context.tempfiles['pngfile_' + params.pagenum] : null;
		
		if (!params.pngfilepath) {

			params.pngfilepath = path.join(params.tmpdir, uuid.v1() + '.png');
			context.tempfiles = context.tempfiles || {};
			context.tempfiles['pngfile_' + params.pagenum] = params.pngfilepath;

			genPngFn(params, function(err, features) {
				if (err) { console.log(err.stack); throw Chain.StopChainErr; }

				context.tempfiles['pngfile_features_' + params.pagenum] = features;

				calcGrayLevelFn(params, features, cb);

			})

		} else {

			var features = context.tempfiles['pngfile_features_' + params.pagenum];
			calcGrayLevelFn(params, features, cb);

		}

	});

	var result = getGrayLevel(params);

	console.log('GRAY LEVEL>', result);

	return result;

}

var insideFunc = function(data, args, last, context) {

	if (!args.length) throw Chain.StopChainErr;

	var area = args[0];

	var xmin = area['xmin'];
	var ymin = area['ymin'];
	var xmax = area['xmax'];
	var ymax = area['ymax'];
	var pagenum = context['pagenum'];

	var foundwords = [];

	var insidefn = function(wxmin, wymin, wxmax, wymax) {
		return wxmin >= xmin &&
			   wymin >= ymin &&
			   wxmax <= xmax &&
			   wymax <= ymax;	
	}

	for (w in last) {
		var word = last[w];
		var wxmin = word['xmin'];
		var wymin = word['ymin'];
		var wxmax = word['xmax'];
		var wymax = word['ymax'];

		if (insidefn(wxmin, wymin, wxmax, wymax)) foundwords.push(word);
	}

	foundwords.sort(function(a, b) {
		var aymin = a['ymin'];
		var bymin = b['ymin'];

		if (aymin < bymin)
			return -1;
		else if (aymin > bymin)
			return 1;
		else
			return 0;
	});

	return foundwords;

}

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
	allTexts: allTextsFunc,
	sameLineTexts: sameLineTextsFunc,
	concatTexts: concatTextsFunc,

	cropGrayLevel: cropGrayLevelFunc,

	right: rightFunc,
	below: belowFunc,
	inside: insideFunc,

	first: firstFunc,

	getText: getTextFunc,
	removeNonDigits: removeNonDigitsFunc,

	removeTextNonDigits: removeTextNonDigitsFunc

});

module.exports = Chain;