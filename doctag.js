var Q = require('q');
var path = require('path');
var fs = require('fs');
var uuid = require('uuid');
var qr = require('qr-image');
var exec = require('child-process-promise').exec;

function DocTag(binpath) {

	this.binpath = binpath || '';

};

DocTag.prototype.print = function(filepath, templateref) {

	var self = this;
	var p = Q();

	var tags = templateref['tags'];
	var tagresult = null;

	if (tags)
		p = p
		.then(function() {

			return tags.reduce(function(p, tag) {
				return p.then(function() {

					switch (tag['type']) {

						case 'qr':
							return self._qr(filepath, tag)
							.then(function(tagresult_) {
								tagresult = tagresult_;
							})
							break;

						default:
							throw new Error('Tag type invalid.');

					}

				});
			}, Q());

		});

	return p
	.then(function() {
		return tagresult;
	});

};

DocTag.prototype._qr = function(filepath, tag) {

	var self = this;
	var p = Q();

	var newfilepathbase = path.join(path.dirname(filepath), uuid.v1());

	var pngfilepath = newfilepathbase + '.png';
	var qrepsfilepath = newfilepathbase + '.eps';
	var qrpdffilepath = newfilepathbase + '_qr.pdf';
	var qr2pdffilepath = newfilepathbase + '_qr2.pdf';
	var qr2pngfilepath = newfilepathbase + '_qr2.png';
	var qr2trimmedpngfilepath = newfilepathbase + '_qr2_trim.png';
	var newpdffilepath = newfilepathbase + '.pdf';

	var pageinfo = {};
	var taginfo = {};

	return p

	// Gen EPS file with QR...
	.then(function() {

		var value = tag['value'];
		var qr_eps = qr.image(value, { type: 'eps' });

		taginfo['value'] = value;

		return Q.nfcall(function(qrepsfilepath, qr_eps, callback) {
			qr_eps.pipe(fs.createWriteStream(qrepsfilepath))
			.on('finish', function() {
				callback();
			});
		}, qrepsfilepath, qr_eps)
		.then(function() {
			return value;
		})

	})

	// Write EPS file with QR...
	.then(function(value) {

		var size = tag['size'] || 45;
		var scale = size/(.4*value.length);

		scale = scale > 1.7 ? 1.7 : scale;
		var epscontent = fs.readFileSync(qrepsfilepath, 'utf8');

		fs.writeFileSync(qrepsfilepath, epscontent.replace('%%BoundingBox: 0 0 243 243', ['%%BoundingBox: 0 0 ', size, size].join(' ')).replace('9 9 scale', [scale, scale, 'scale'].join(' ')));

	})

	// Get original PDF width and height
	.then(function() {
		return exec([path.join(self.binpath, 'pdfinfo'), filepath].join(' '));
	})
	.then(function(result) {

		if (result.exitCode) throw new Error('identify exited with code ' + result.exitCode);

		console.log(result.stdout);

		var regex = /Page\ssize:\s+(\d+.\d+)\sx\s(\d+.\d+)\spts/;
		if (!regex.test(result.stdout)) throw new Error('unexpected response from pdfinfo ' + result.stdout);
		var valuesr = regex.exec(result.stdout);
		if (valuesr.length < 3) throw new Error('unexpected response from pdfinfo ' + result.stdout);

		pageinfo['width'] = parseFloat(valuesr[1]);
		pageinfo['height'] = parseFloat(valuesr[2]);

	})

	// Print EPS on PDF
	.then(function() {
		return exec([path.join(self.binpath, 'ps2pdf'), '-dDEVICEWIDTHPOINTS=' + pageinfo['width'], '-dDEVICEHEIGHTPOINTS=' + pageinfo['height'], qrepsfilepath, qrpdffilepath].join(' '));
	})
	.then(function(result) {

		var x = 0;
		var y = 0;

		if (tag['position']) {
			x = tag['position']['x'];
			y = tag['position']['y'];
		}

		taginfo['xmin'] = x;
		taginfo['ymax'] = y;

		x = x*pageinfo['width'];
		y = (1-y)*pageinfo['height'];

		if (result.exitCode) throw new Error('ps2pdf exited with code ' + result.exitCode);
		return exec([path.join(self.binpath, 'gs'), '-sDEVICE=pdfwrite', '-o', qr2pdffilepath, '-dPDFSETTINGS=/prepress', '-c', '"<</PageOffset [', x, ' ', y, ']>> setpagedevice"', '-f', qrpdffilepath].join(' '));

	})
	.then(function(result) {
		if (result.exitCode) throw new Error('gs exited with code ' + result.exitCode);
		console.log([path.join(self.binpath, 'pdftk'), filepath, 'stamp', qr2pdffilepath, 'output', newpdffilepath].join(' '));
		return exec([path.join(self.binpath, 'pdftk'), filepath, 'stamp', qr2pdffilepath, 'output', newpdffilepath].join(' '));
	})
	.then(function(result) {
		if (result.exitCode) throw new Error('pdftk exited with code ' + result.exitCode);
		return exec([path.join(self.binpath, 'gs'), '-sDEVICE=pngalpha', '-o', qr2pngfilepath, ['-r', '200'].join(''), qr2pdffilepath].join(' '))
		// return exec([path.join(self.binpath, 'convert'), qr2pdffilepath, qr2pngfilepath].join(' '))
	})
	.then(function(result) {
		if (result.exitCode) throw new Error('convert exited with code ' + result.exitCode);
		return exec([path.join(self.binpath, 'convert'), qr2pngfilepath, '-trim', qr2trimmedpngfilepath].join(' '))
	})
	.then(function(result) {
		if (result.exitCode) throw new Error('convert exited with code ' + result.exitCode);
		return exec([path.join(self.binpath, 'identify'), qr2trimmedpngfilepath].join(' '))	
	})
	.then(function(result) {
		if (result.exitCode) throw new Error('identify exited with code ' + result.exitCode);

		var regex = /(\d+)x(\d+)\s(\d+)x(\d+)\+(\d+)\+(\d+)/;
		if (!regex.test(result.stdout)) throw new Error('unexpected response from identify ' + result.stdout);
		var valuesr = regex.exec(result.stdout);
		if (valuesr.length < 7) throw new Error('unexpected response from identify ' + result.stdout);

		var tagwidth = parseFloat(valuesr[1]);
		var tagheight = parseFloat(valuesr[2]);

		taginfo['xmax'] = taginfo['xmin'] + tagwidth/pageinfo['width'];
		taginfo['ymin'] = taginfo['ymax'] - tagheight/pageinfo['height'];

	})
	.then(function() {

		fs.unlink(qrepsfilepath);
		fs.unlink(qrpdffilepath);
		fs.unlink(qr2pdffilepath);
		fs.unlink(qr2pngfilepath);
		fs.unlink(qr2trimmedpngfilepath);

		return {
			'newpdffilepath': newpdffilepath,
			'taginfo': taginfo
		};
	});

};

module.exports = DocTag;