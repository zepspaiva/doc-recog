var path = require('path');

var DocData = require('./docdata.js');
var DocMatch = require('./docmatch.js');
var DocTag = require('./doctag.js');

exports.recog = function(templatebasepath, filepath, params, binpath, tmppath) {

	if (!templatebasepath) throw new Error('No template base path provided.');
	if (!filepath) throw new Error('No filepath path provided.');
	
	params = params || {};

	var docmatch = new DocMatch(templatebasepath);
	var docdata = new DocData(filepath, binpath, tmppath);
	var doctag = new DocTag(binpath, tmppath);

	// Match templates...
	return docmatch.match(docdata)

	// Choose the best template...
	.then(function(templates) {
		if (!templates.length) throw new Error('No template found.');
		
		// Confiability logic here...
		return templates[0];

	})

	// Set arguments to chosen template data...
	.then(function(templateref) {
		return docmatch.readargs(docdata, templateref, params)
		.then(function(templateref_) {
			return templateref_;
		});
	})

	// Extract chosen template data...
	.then(function(templateref) {
		return docmatch.extract(docdata, templateref)
		.then(function(templateref_) {
			return templateref_;
		});
	})

	// Gen template tags data...
	.then(function(templateref) {
		return docmatch.gentags(docdata, templateref)
		.then(function(templateref_) {
			return templateref_;
		});
	})

	// Print template tags...
	.then(function(templateref) {
		return doctag.print(filepath, templateref)
		.then(function(newfilepath) {
			return { 'template': templateref, 'newfilepath': newfilepath };
		});
	})

	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});
  
}