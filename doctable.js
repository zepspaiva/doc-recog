var Q = require('q');

var Chain = require('./chain.js');
var DocQuery = require('./docquery.js');

function DocTable(filepath, docdata, config, context, tempdirpath) {

    this.filepath = filepath;
    this.docdata = docdata;
    this.config = config;
    this.context = context || {};
    this.tempdirpath = tempdirpath;

};

DocTable.prototype._defineTableDataArea = function(tabledata, docdata) {

    var self = this;
    var p = Q();

    var tabledataarea = {
        'xmin': -1,
        'ymin': -1,
        'xmax': -1,
        'ymax': -1
    };

    if (tabledata.header)
        p = p
        .then(function() {
            tabledataarea['xmin'] = tabledata.header['xmin'];
            tabledataarea['ymin'] = tabledata.header['ymax'];
            tabledataarea['xmax'] = tabledata.header['xmax'];
        });

    if (tabledata.base)
        p = p
        .then(function() {
            tabledataarea['ymax'] = tabledata.base['ymin'];
        });

    p = p
    .then(function() {
        return docdata.getData();
    })
    .then(function(data) {
        var wordsinsidetablearea = new Chain(data).getPage(1).getWords().inside(tabledataarea).done();
        if (wordsinsidetablearea && wordsinsidetablearea.length) {

            var filledtablearea = new Chain(data).getPage(1).getWords().inside(tabledataarea).concatTexts().padding(0.0125).done();
            
            if (filledtablearea && filledtablearea['ymax'] != -1) {
                if ((tabledataarea['ymax'] - filledtablearea['ymax']) > 0.2*(tabledataarea['ymax']-tabledataarea['ymin']))
                    tabledataarea['ymax'] = filledtablearea['ymax']*1.0125;
            }

        }
    });

    return p
    .then(function() {
        return tabledataarea;
    });

};

DocTable.prototype._defineTableRows = function(tablemeta, config, docdata) {

    var self = this;
    var p = Q();

    var rows = [];
    var rowmarker = null;

    config.columns.forEach(function(column) {
        if (column['rowmarker']) rowmarker = column;
    });

    if (!rowmarker) throw new Error('No rowmarker column.');

    p = p
    .then(function() {
        return self.docdata.getData()
    })
    .then(function(data) {

        var p = Q();

        var c = new Chain(data, self.context);
        var pagenum = self.context['pagenum'];
        var dataarea = tablemeta['dataarea'];

        var markers = c.getPage(pagenum).getWords().inside({
            'xmin': dataarea['xmin'],
            'ymin': dataarea['ymin'],
            'ymax': dataarea['ymax'],
            'xmax': (dataarea['xmax'] - dataarea['xmin'])*rowmarker['width'] + dataarea['xmin']
        }).done();

        var lastrow = null;
        var lastrowymin = dataarea['ymin'];

        var rowxmin = dataarea['xmin'];
        var rowxmax = dataarea['xmax'];
        var rowmargin = config['margins'] && config['margins']['row'] ? config['margins']['row'] : [0,0,0,0];

        // no empty table!
        if (!markers.length)
            rows.push({
                'xmin': rowxmin + rowmargin[3],
                'ymin': dataarea['ymin'] + rowmargin[0],
                'xmax': rowxmax + rowmargin[1],
                'ymax': dataarea['ymax'] + rowmargin[2]
            });

        for (var i = 0; i < markers.length; i++) {

            var marker = markers[i];
            var ydist = marker['ymin'] - lastrowymin;

            if (i == 0) {
                if (ydist > 0.02)
                    rows.push({
                        'xmin': rowxmin + rowmargin[3],
                        'ymin': lastrowymin,// + rowmargin[0],
                        'xmax': rowxmax + rowmargin[1],
                        'ymax': marker['ymin'] + rowmargin[2]
                    });
            } else {
                lastrow['ymax'] = marker['ymin'] + rowmargin[2];
                rows.push(lastrow);
            }

            lastrow = {
                'text': marker['text'],
                'xmin': rowxmin + rowmargin[3],
                'ymin': marker['ymin'] + rowmargin[0],
                'xmax': rowxmax + rowmargin[1]
            };
            
        }

        if (lastrow) {
            lastrow['ymax'] = dataarea['ymax'];
            rows.push(lastrow);
        }

    });

    return p
    .then(function() {
        return rows;
    });

};

DocTable.prototype._defineTableCells = function(tablemeta, config, docdata) {

    var self = this;
    var p = Q();

    var rows = tablemeta['rows'];
    var dataarea = tablemeta['dataarea'];
    var rowxmin = dataarea['xmin'];
    var rowxmax = dataarea['xmax'];
    var rowwidth = rowxmax - rowxmin;

    p = p
    .then(function() {
        return docdata.getData();
    })
    .then(function(data) {

        var c = new Chain(data, self.context);
        var pagenum = self.context['pagenum'];

        return rows.reduce(function(p, row) {
            return p.then(function() {

                var cells = [];
                var curcellxmin = rowxmin;

                return Q.all(config.columns.map(function(column) {

                    var cellxmax = column['width']*rowwidth + curcellxmin;

                    var cell = {
                        'name': column['name'],
                        'ymin': row['ymin'],
                        'xmin': curcellxmin,
                        'xmax': cellxmax,
                        'ymax': row['ymax']
                    };

                    switch (column['value']) {

                        case 'graylevel':
                            var graylevel_navalue = column['navalue'] ? column['navalue'] : 0.3;
                            var graylevel_calcvalue = c.getPage(pagenum).cropGrayLevel({
                                'filepath': self.filepath,
                                'tmpdir': self.tempdirpath,
                                'xmin': cell['xmin'],
                                'ymin': cell['ymin'],
                                'xmax': cell['xmax'],
                                'ymax': cell['ymax']
                            }).done();
                            cell['text'] = graylevel_calcvalue > graylevel_navalue ? 'N/A' : ' ';
                            break;

                        case 'default':
                            cell['text'] = column['default'];
                            break;

                        default:
                            cell['text'] = c.getPage(pagenum).getWords().inside({
                                'xmin': cell['xmin'],
                                'ymin': cell['ymin'],
                                'xmax': cell['xmax'],
                                'ymax': cell['ymax']
                            }).concatTexts().getText().done();

                            if (column['contextvar']) {
                                self.context[column['contextvar']] = self.context[column['contextvar']] || [];
                                self.context[column['contextvar']].push(cell['text'])
                            }

                    }

                    cells.push(cell);
                    curcellxmin = cellxmax;

                }))
                .then(function() {
                    row['cells'] = cells;
                });

            });
        }, Q());


        // rows.forEach(function(row) {

        //     var cells = [];
        //     var curcellxmin = rowxmin;

        //     config.columns.forEach(function(column) {

        //         var cellxmax = column['width']*rowwidth + curcellxmin;

        //         var cell = {
        //             'name': column['name'],
        //             'ymin': row['ymin'],
        //             'xmin': curcellxmin,
        //             'xmax': cellxmax,
        //             'ymax': row['ymax']
        //         };

        //         switch (column['value']) {

        //             case 'graylevel':
        //                 cell['text'] = c.getPage(pagenum).cropGrayLevel({
        //                     'filepath': self.filepath,
        //                     'tmpdir': self.tempdirpath,
        //                     'xmin': cell['xmin'],
        //                     'ymin': cell['ymin'],
        //                     'xmax': cell['xmax'],
        //                     'ymax': cell['ymax']
        //                 }).done() > 0.4 ? 'N/A' : 'N';
        //                 break;

        //             default:
        //                 cell['text'] = c.getPage(pagenum).getWords().inside({
        //                     'xmin': cell['xmin'],
        //                     'ymin': cell['ymin'],
        //                     'xmax': cell['xmax'],
        //                     'ymax': cell['ymax']
        //                 }).concatTexts().getText().done();

        //         }

        //         cells.push(cell);
        //         curcellxmin = cellxmax;

        //     });

        //     row['cells'] = cells;

        // });

    });

    return p
    .then(function() {
        return rows;
    });

};

DocTable.prototype._defineTableData = function(tablemeta, config, docdata) {

    var self = this;
    var p = Q();
    var data = {};

    p = p
    .then(function() {
        var idx = 1;
        tablemeta.rows.forEach(function(row) {
            row.cells.forEach(function(cell) {
                var name = cell['name'];
                var key = [name, idx].join('_');
                data[key] = cell;
            });
            idx++;
        });
    });

    return p
    .then(function() {
        return data;
    });

};

DocTable.prototype.run = function() {
    
    var self = this;
    var tabledata = {
        'meta': {},
        'data': {}
    };
    var tablemeta = tabledata['meta'];

    var config = self.config;
    var docdata = self.docdata;
    var context = self.context;
    
    return Q()
    .then(function() {

        var p = Q();

        if (config.header)
            p = p
            .then(function() {
                return new DocQuery(docdata, config.header, context).run();
            })
            .then(function(value) {
                if (!value) throw new Error('Table header not found.');
                tablemeta['header'] = value;
            });

        if (config.base)
            p = p
            .then(function() {
                return new DocQuery(docdata, config.base, context).run();
            })
            .then(function(value) {
                if (!value) throw new Error('Table base not found.');
                tablemeta['base'] = value;
            });

        // Define table's data area
        p = p
        .then(function() {
            return self._defineTableDataArea(tablemeta, docdata)
        })
        .then(function(value) {
            tablemeta['dataarea'] = value;
        });

        // Define table rows
        p = p
        .then(function() {
            return self._defineTableRows(tablemeta, config, docdata);
        })
        .then(function(value) {
            tablemeta['rows'] = value;
        });

        // Define table cells
        p = p
        .then(function() {
            return self._defineTableCells(tablemeta, config, docdata);
        })
        .then(function(value) {
            tablemeta['rows'] = value;
        });

        // Define table data
        p = p
        .then(function() {
            return self._defineTableData(tablemeta, config, docdata);
        })
        .then(function(value) {
            tabledata['data'] = value;
        });

        return p
        .then(function() {
            return tabledata;
        });
        
    })
    .catch(function(err) {
    	console.log(err.stack);
    	return null;
    });

}

module.exports = DocTable;