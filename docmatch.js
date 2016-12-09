var Q = require('q');
var path = require('path');
var fs = require('fs');

var DocQuery = require('./docquery.js');
var DocTable = require('./doctable.js');

var DEBUG = false;
var JSON_EXT = '.json';

function DocMatch(templatebasepath) {

    this.templatebasepath = templatebasepath;
    this.templatebase = {};
    this.ready = false;

};

DocMatch.prototype._prepare = function() {

	var self = this;

	var templatefiles = fs.readdirSync(self.templatebasepath).filter(function(filename) {
		return path.extname(filename) === JSON_EXT;
	});

	return Q.all(templatefiles.map(function(filename) {

		return self._parseTemplate(filename)
		.then(function(template) {
			var templatekey = path.basename(filename, JSON_EXT);
			self.templatebase[templatekey] = template;
		});

	}))
	.then(function() {
		self.ready = false;
	})
	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});

};

DocMatch.prototype._parseTemplate = function(filename) {
	
	var self = this;

	return Q()
	.then(function() {

		var filepath = path.join(self.templatebasepath, filename);

		if (!fs.existsSync(filepath)) throw new Error('File not found. ' + filepath);
		if (fs.statSync(filepath)['size'] == 0) throw new Error('File has size 0. ' + filepath);

		return JSON.parse(fs.readFileSync(filepath));

	})
	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});

};

DocMatch.prototype._templateMatch = function(docdata, template, context) {

	var p = Q();
	var templatematch = true;
	var recognitionrules = template['recognition'];

	if (recognitionrules)
		p = p
		.then(function() {
			return recognitionrules.reduce(function(p, recognitionrule) {
				return p.then(function() {
					if (!templatematch) return Q();

					var p = Q();
					var query = recognitionrule['query'];

					if (query)
						p = p
						.then(function() {
							return new DocQuery(docdata, query, context).run();
						})
						.then(function(value) {
							templatematch = templatematch && value;
						});

					return p;

				});
			}, Q());
		});

	return p
	.then(function() {
		return templatematch ? template : null;
	});

};

DocMatch.prototype._setArgsData = function(docdata, template, context, args, argsprofile) {

	var p = Q();
	var data = {};
	var argumentsrules = template['arguments'][argsprofile];

	if (argumentsrules)
		p = p
		.then(function() {

			return argumentsrules.reduce(function(p, argumentrule) {
				return p.then(function() {

					var p = Q();
					var name = argumentrule['name'];
					var required = argumentrule['required'];
					var contextvar = argumentrule['contextvar'];

					var value = args[name];

					if (required && value == null) throw new Error(['Argument expected', name].join(' '));

					if (contextvar)
						p = p
						.then(function() {
							context[contextvar] = value;
						});

					return p;

				});
			}, Q());

		});

	return p
	.then(function() {
		return data;
	});

};

DocMatch.prototype._extractionData = function(filepath, docdata, template, context) {

	var p = Q();
	var data = {};
	var extractionrules = template['extraction'];

	if (extractionrules)
		p = p
		.then(function() {

			return extractionrules.reduce(function(p, extractionrule) {
				return p.then(function() {

					var p = Q();
					var name = extractionrule['name'];
					var query = extractionrule['query'];
					var table = extractionrule['table'];

					if (query)
						p = p
						.then(function() {
							return new DocQuery(docdata, query, context).run();
						})
						.then(function(value) {
							data[name] = value;
						});

					if (table)
						p = p
						.then(function() {
							return new DocTable(filepath, docdata, table, context).run();
						})
						.then(function(value) {

							if (DEBUG) console.log(value);

							var tabledata = value['data'];
							for (k in tabledata) {
								var key = [name, k].join('_');
								data[key] = tabledata[k];
							}
							
						});

					return p;

				});
			}, Q());

		});

	return p
	.then(function() {
		return data;
	});

};

DocMatch.prototype._taggingData = function(docdata, template, context) {

	var p = Q();
	var tags = [];
	var taggingrules = template['tagging'];

	if (taggingrules)
		p = p
		.then(function() {

			return taggingrules.reduce(function(p, taggingrule) {
				return p.then(function() {

					var p = Q();
					var type = taggingrule['type'];
					var query = taggingrule['query'];
					var size = taggingrule['size'];
					var position = taggingrule['position'];

					if (query)
						p = p
						.then(function() {
							return new DocQuery(docdata, query, context).run();
						})
						.then(function(value) {
							tags.push({
								'type': type,
								'size': size,
								'position': position,
								'value': value
							});
						});

					return p;

				});
			}, Q());

		});

	return p
	.then(function() {
		return tags;
	});

};

DocMatch.prototype.match = function(docdata) {

	var self = this;
	var p = Q();

	if (!self.ready)
		p = p
		.then(function() {
			return self._prepare();
		});

	return p

	// Look for templates where recognitionrules are true
	.then(function() {

		var templatesmatches = [];
		var templatekeys = Object.keys(self.templatebase);

		return Q.all(templatekeys.map(function(templatekey) {

			var template = self.templatebase[templatekey];
			if (!template) throw new Error(['Template not found:', templatekey].join(' '));

			var context = {};

			return self._templateMatch(docdata, template, context)
			.then(function(templatematch) {
				if (templatematch) {
					templatesmatches.push({
						'name': templatematch['name'],
						'type': templatematch['type'],
						'template': templatematch,
						'context': context
					});
				}
			});

		}))
		.then(function() {
			return templatesmatches;
		});

	})

	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});

};

DocMatch.prototype.readargs = function(docdata, templateref, args, argsprofile) {

	var self = this;
	var p = Q();

	if (!self.ready)
		p = p
		.then(function() {
			return self._prepare();
		});

	return p

	// Read args data 
	.then(function() {

		var result = {};

		var template = templateref['template'];
		var context = templateref['context'];

		return self._setArgsData(docdata, template, context, args, argsprofile)
		.then(function(templatedata) {
			templateref['data'] = templatedata;
		})
		.then(function() {
			return templateref;
		});

	})

	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});

};

DocMatch.prototype.extract = function(filepath, docdata, templateref) {

	var self = this;
	var p = Q();

	if (!self.ready)
		p = p
		.then(function() {
			return self._prepare();
		});

	return p

	// Extract fields data 
	.then(function() {

		var result = {};

		var template = templateref['template'];
		var context = templateref['context'];

		return self._extractionData(filepath, docdata, template, context)
		.then(function(templatedata) {
			templateref['data'] = templatedata;
		})
		.then(function() {
			return templateref;
		});

	})

	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});

};

DocMatch.prototype.gentags = function(docdata, templateref) {

	var self = this;
	var p = Q();

	if (!self.ready)
		p = p
		.then(function() {
			return self._prepare();
		});

	return p

	// Gen tags data
	.then(function(templatesmatches) {

		var result = {};

		var template = templateref['template'];
		var context = templateref['context'];

		return self._taggingData(docdata, template, context)
		.then(function(taggingdata) {
			templateref['tags'] = taggingdata;
		})
		.then(function() {
			return templateref;
		});

	})

	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});

};

module.exports = DocMatch;