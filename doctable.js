var Q = require('q');

var Chain = require('./chain.js');
var DocQuery = require('./docquery.js');

function DocTable(filepath, docdata, config, context) {

    this.filepath = filepath;
    this.docdata = docdata;
    this.config = config;
    this.context = context || {};

};

DocTable.prototype._defineTableDataArea = function(tabledata) {

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

        for (var i = 0; i < markers.length; i++) {

            var marker = markers[i];
            var ydist = marker['ymin'] - lastrowymin;

            if (i == 0) {
                if (ydist > 0.02)
                    rows.push({
                        'xmin': rowxmin,
                        'ymin': lastrowymin,
                        'xmax': rowxmax,
                        'ymax': marker['ymin']
                    });
            } else {
                lastrow['ymax'] = marker['ymin'];
                rows.push(lastrow);
            }

            lastrow = {
                'text': marker['text'],
                'xmin': rowxmin,
                'ymin': marker['ymin']-0.01,
                'xmax': rowxmax
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

        rows.forEach(function(row) {

            var cells = [];
            var curcellxmin = rowxmin;

            config.columns.forEach(function(column) {

                var cellxmax = column['width']*rowwidth + curcellxmin;

                var cell = {
                    'name': column['name'],
                    'ymin': row['ymin'],
                    'xmin': curcellxmin,
                    'xmax': cellxmax,
                    'ymax': row['ymax']
                };

                cell['text'] = c.getPage(pagenum).getWords().inside({
                    'xmin': cell['xmin'],
                    'ymin': cell['ymin'],
                    'xmax': cell['xmax'],
                    'ymax': cell['ymax']
                }).concatTexts().getText().done();

                cells.push(cell);
                curcellxmin = cellxmax;

            });

            row['cells'] = cells;

        });

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
    })

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
                tablemeta['header'] = value;
            });

        if (config.base)
            p = p
            .then(function() {
                return new DocQuery(docdata, config.base, context).run();
            })
            .then(function(value) {
                tablemeta['base'] = value;
            });

        // Define table's data area
        p = p
        .then(function() {
            return self._defineTableDataArea(tablemeta)
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
    	throw err;
    });

}

module.exports = DocTable;