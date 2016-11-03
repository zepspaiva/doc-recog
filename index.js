var argv = require('yargs').argv;
var path = require('path');

var DocData = require('./docdata.js');
var DocMatch = require('./docmatch.js');
var DocTag = require('./doctag.js');

var templatebasepath = process.argv[2];
var filepath = process.argv[3];
var expected = null;

if (process.argv.length >= 5)
	expected = process.argv[4];

var docmatch = new DocMatch(templatebasepath);
var docdata = new DocData(filepath);
var doctag = new DocTag();

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
	return docmatch.readargs(docdata, templateref, argv)
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
		console.log(newfilepath);
		return templateref;
	});
})

.then(function(templateref) {
	//console.log(templateref);
})

.catch(function(err) {
	console.log(err.stack);
});