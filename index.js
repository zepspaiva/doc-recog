var path = require('path');

var DocData = require('./docdata.js');
var DocMatch = require('./docmatch.js');
var DocTag = require('./doctag.js');

exports.recog = function(templatebasepath, filepath, params, binpath, tmppath) {

	if (!templatebasepath) throw new Error('No template base path provided.');
	if (!filepath) throw new Error('No filepath path provided.');
	
	var argsprofile = 'recog';
	params = params || {};

	var docmatch = new DocMatch(templatebasepath);
	var docdata = new DocData(filepath, binpath, tmppath);

	// Match templates...
	console.log('Will match template');
	return docmatch.match(docdata)

	// Choose the best template...
	.then(function(templates) {
		if (!templates.length) throw new Error('No template found.');
		return templates[0];
	})

	// Set arguments to chosen template data...
	.then(function(templateref) {
		console.log('Matched template', templateref);
		return docmatch.readargs(docdata, templateref, params, argsprofile);
	})

	// Extract chosen template data...
	.then(function(templateref) {
		console.log('Read args', templateref);
		return docmatch.extract(docdata, templateref);
	})
	.then(function(templateref) {
		console.log('Extracted data', templateref);
		return { 'result': templateref, 'newfilepath': filepath };
	})

	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});
  
}

exports.tag = function(templatebasepath, filepath, params, binpath, tmppath) {

	if (!templatebasepath) throw new Error('No template base path provided.');
	if (!filepath) throw new Error('No filepath path provided.');
	
	params = params || {};

	var argsprofile = 'tag';

	var docmatch = new DocMatch(templatebasepath);
	var docdata = new DocData(filepath, binpath, tmppath);
	var doctag = new DocTag(binpath);

	// Match templates...
	console.log('Will match template');
	return docmatch.match(docdata)

	// Choose the best template...
	.then(function(templates) {
		if (!templates.length) throw new Error('No template found.');
		return templates[0];
	})

	// Set arguments to chosen template data...
	.then(function(templateref) {
		console.log('Got template', JSON.stringify(templateref));
		return docmatch.readargs(docdata, templateref, params, argsprofile);
	})

	// Extract chosen template data...
	.then(function(templateref) {
		console.log('Read args', JSON.stringify(templateref));
		return docmatch.extract(docdata, templateref);
	})

	// Gen template tags data...
	.then(function(templateref) {
		console.log('Extracted data', JSON.stringify(templateref));
		return docmatch.gentags(docdata, templateref);
	})

	// Print template tags...
	.then(function(templateref) {
		console.log('Generated tags', JSON.stringify(templateref));
		return doctag.print(filepath, templateref)
		.then(function(newfilepath) {
			console.log('Printed tags', newfilepath);
			return { 'result': templateref, 'newfilepath': newfilepath };
		});
	})

	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});
  
}