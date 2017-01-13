var Q = require('q');
var cheerio = require('cheerio');
var uuid = require('uuid');
var exec = require('child-process-promise').exec;
var path = require('path');
var fs = require('fs');

function DocData(filepath, binpath, tmppath) {

	this.filetype = path.extname(filepath).toLowerCase();
    this.filepath = filepath;
    this.binpath = binpath || '';
    this.tmppath = tmppath || '';
    this.ready = false;

};

DocData.prototype.getData = function() {

	var self = this;
	var p = Q();

	if (!self.ready)
		p = p
		.then(function() {
			return self._prepare();
		});

	return p
	.then(function() {
		return self.data;
	});

};

DocData.prototype._prepare = function() {

	var self = this;
	var p = Q();

	switch (self.filetype) {

		case '.pdf':
			p = p
			.then(function() {
				return self._readPDF();
			});
			break;

		default:
			throw new Error('Unknown filetype ' + self.filetype);

	}

	return p
	.then(function() {
		self.ready = true;
	});

};

DocData.prototype._readPDF = function() {

	var self = this;
	var tempfile = path.join(self.tmppath, uuid.v1());

	return exec([path.join(self.binpath, 'pdftotext'), '-bbox', '"' + self.filepath + '"', tempfile].join(' '))
	.then(function(result) {

		if (result.exitCode) throw new Error('pdftotext exited with code ' + result.exitCode);

		var $ = cheerio.load(fs.readFileSync(tempfile));

		var pages = [];
		var pagenumber = 1;

		$('page').each(function(i, p) {
			
			var $p = $(p);

			var pagewidth = parseFloat($p.attr('width'));
			var pageheight = parseFloat($p.attr('height'));

		    var page = {
		    	'number': pagenumber++,
		    	'width': pagewidth,
		    	'height': pageheight,
		    	'words': []
		    };

		    $p.find('word').each(function(i, w) {

		    	var $w = $(w);
		    	var xmin = parseFloat($w.attr('xmin')) / pagewidth;
		    	var ymin = parseFloat($w.attr('ymin')) / pageheight;
		    	var xmax = parseFloat($w.attr('xmax')) / pagewidth;
		    	var ymax = parseFloat($w.attr('ymax')) / pageheight;
		    	var xcenter = (xmax-xmin)/2 + xmin;
		    	var ycenter = (ymax-ymin)/2 + ymin;

		    	var word = {
		    		'text': $w.text(),
		    		'xmin': xmin,
		    		'ymin': ymin,
		    		'xmax': xmax,
		    		'ymax': ymax,
		    		'xcenter': xcenter,
		    		'ycenter': ycenter
		    	};

		    	page['words'].push(word);

		    });

		   pages.push(page);

		});

		fs.unlink(tempfile);

		self.data = {
			"filepath": self.filepath,
			"filename": path.basename(self.filepath),
			"pages": pages
		};

	});

};

module.exports = DocData;