var path = require('path');
var fs = require('fs-extra')

var DocData = require('./docdata.js');
var DocMatch = require('./docmatch.js');
var DocTag = require('./doctag.js');

var DEBUG = false;

exports.recog = function(templatebasepath, filepath, params, binpath, tmppath) {

	if (!templatebasepath) throw new Error('No template base path provided.');
	if (!filepath) throw new Error('No filepath path provided.');
	
	var argsprofile = 'recog';
	params = params || {};

	var tempfolderpath = tmppath || 'temp';
	fs.mkdirsSync(tempfolderpath);

	var docmatch = new DocMatch(templatebasepath, tempfolderpath);
	var docdata = new DocData(filepath, binpath, tmppath);

	// Match templates...
	if (DEBUG) console.log('Will match template');
	return docmatch.match(docdata)

	// Choose the best template...
	.then(function(templates) {
		if (!templates.length) throw new Error('No template found.');
		return templates[0];
	})

	// Set arguments to chosen template data...
	.then(function(templateref) {
		if (DEBUG) console.log('Matched template', templateref);
		return docmatch.readargs(docdata, templateref, params, argsprofile);
	})

	// Extract chosen template data...
	.then(function(templateref) {
		if (DEBUG) console.log('Read args', templateref);
		return docmatch.extract(filepath, docdata, templateref);
	})
	.then(function(templateref) {
		if (DEBUG) console.log('Extracted data', templateref);
		fs.removeSync(tempfolderpath);
		return { 'result': templateref, 'newfilepath': filepath };
	})

	.catch(function(err) {
		console.log(err.stack);
		fs.removeSync(tempfolderpath);
		throw err;
	});
  
}

exports.tag = function(templatebasepath, filepath, params, binpath, tmppath) {

	if (!templatebasepath) throw new Error('No template base path provided.');
	if (!filepath) throw new Error('No filepath path provided.');
	
	params = params || {};

	var tempfolderpath = tmppath || 'temp';
	fs.mkdirsSync(tempfolderpath);

	var argsprofile = 'tag';

	var docmatch = new DocMatch(templatebasepath, tempfolderpath);
	var docdata = new DocData(filepath, binpath, tmppath);
	var doctag = new DocTag(binpath);

	// Match templates...
	if (DEBUG) console.log('Will match template');
	return docmatch.match(docdata)

	// Choose the best template...
	.then(function(templates) {
		if (!templates.length) throw new Error('No template found.');
		return templates[0];
	})

	// Set arguments to chosen template data...
	.then(function(templateref) {
		if (DEBUG) console.log('Got template', JSON.stringify(templateref));
		return docmatch.readargs(docdata, templateref, params, argsprofile);
	})

	// Extract chosen template data...
	.then(function(templateref) {
		if (DEBUG) console.log('Read args', JSON.stringify(templateref));
		return docmatch.extract(filepath, docdata, templateref);
	})

	// Gen template tags data...
	.then(function(templateref) {
		if (DEBUG) console.log('Extracted data', JSON.stringify(templateref));
		return docmatch.gentags(docdata, templateref);
	})

	// Print template tags...
	.then(function(templateref) {
		if (DEBUG) console.log('Generated tags', JSON.stringify(templateref));
		return doctag.print(filepath, templateref)
		.then(function(newfilepath) {
			if (DEBUG) console.log('Printed tags', newfilepath);
			fs.removeSync(tempfolderpath);
			return { 'result': templateref, 'newfilepath': newfilepath };
		});
	})

	.catch(function(err) {
		console.log(err.stack);
		fs.removeSync(tempfolderpath);
		throw err;
	});
  
}