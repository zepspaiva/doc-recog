var prompt = require('prompt');
var argv = require('yargs').argv;
var fs = require('fs-extra');

var DocData = require('../docdata.js');
var DocQuery = require('../docquery.js');

var filepath = argv.filepath;
var tmppath = './tmp';
var binpath = '.';

fs.removeSync(tmppath);
fs.mkdirsSync(tmppath);

console.log('------------------------------------');
console.log('filepath:', filepath);
console.log('------------------------------------');

var docdata = new DocData(filepath, binpath, tmppath);

function query(query) {
	try {
		var context = {};
		return new DocQuery(docdata, query, context).run()
		.then(function(value) {
			console.log('>', value);
		});
	} catch(e) {
		return e.toString();
	}
}

prompt.start();

function get() {
	prompt.get(['query'], function (err, result) {
		if (err) { return console.log(err); }
		return query(result.query)
		.then(function() {
			get();
		})
	});
}

get();