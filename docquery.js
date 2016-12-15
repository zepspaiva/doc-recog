var Q = require('q');

var Chain = require('./chain.js');

function DocQuery(docdata, query, context) {

    this.docdata = docdata;
    this.query = query;
    this.context = context || {};

};

DocQuery.prototype._funcWrapper = function(expr, data) {
    
    var body = expr;
    var f = null;

    if (expr.indexOf('return') < 0) {
        body = ["return", body].join(' ');
    }
    if (data && data != {})
        f = ["(function(value, fields, helper, c) { with(fields) { ", body, " } })"].join('');
    else
        f = ["(function(value, fields, helper, c) { ", body, " })"].join('');
    
    return eval(f);

}

DocQuery.prototype.run = function() {
    
    var self = this;
    var expr = self.query;
    
    return self.docdata.getData()
    .then(function(data) {

    	return Q.nfcall(function(expr, data, callback) {

	        try {
	            
	            if (!data) data = {};

	            var func = self._funcWrapper(expr, data);
	            var c = new Chain(data, self.context);
	            
	            var value = func(value, data, expr, c);
	            if (value == undefined) value = '';

	            callback(null, value);

	        } catch (err) {
	            console.error('EVAL error on expr:', expr);
	            console.error(err.stack);
	            callback(err);
	        }

	    }, expr, data);

    })
    .catch(function(err) {
    	console.log(err.stack);
    	throw err;
    });

}

module.exports = DocQuery;