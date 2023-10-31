import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import { default as express } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const port = 8000;
const root = path.join(__dirname, 'public');
const template = path.join(__dirname, 'templates');

let app = express();
app.use(express.static(root));
app.use("/about-us", express.static(path.join(root, '/about-us.html')));
app.use("/leadership", express.static(path.join(root, '/leadership.html')));


const db = new sqlite3.Database(path.join(__dirname, 'airline.sqlite3'), sqlite3.OPEN_READONLY, (err)=>{
    if(err){
        console.log('Error connecting to database');
    }else{
        console.log('Sucessfully connected');
    }
});

let makeBarGraph = function(data, type, label, col, nickname, page, pageInc){
    let graphData;
    let columns = [];
    let b = (page-1)*pageInc;
    let e = b+pageInc;
    if(e>data.length){
        e = data.length;
    }
    //sets up columns
    for(let i=0; i<col.length; i++){
        let colData = col[i];
        let preferredData = nickname==null? colData : nickname[i];
        columns.push({title:colData, labels:[], preferred:preferredData, y:[]});
    }
    //adds data into columns
    for(let i=b; i<e; i++){
        for(let j=0; j<columns.length; j++){
            let cellData = data[i];
            let colData = col[j];
            columns[j].labels.push(cellData[label]);
            columns[j].y.push(cellData[colData]);
        }
    }
    //creating actual graph
    graphData = 'data:[\n';
    for(let i=0; i<columns.length; i++){
        let column = columns[i];
        graphData += '{type:"'+type+'",\n';
        graphData += 'name:"'+ column.preferred+'",\n';
        graphData += 'showInLegend: "true",\ndataPoints: [\n';
        for(let j=0; j<column.labels.length; j++){
            graphData += '{ y:'+column.y[j]+', label: "'+column.labels[j]+'" },\n';
        }
        graphData += ']\n';
        graphData += '},\n';
    }
    graphData += ']';
    return graphData;
};

app.get('/airline-info', (req, res)=>{
    let query='SELECT airline From Airlines';
    db.all(query, (err, rows)=>{
        if(err){
            res.status(404).type('html').send("Query not found")
            console.log(err);
        }else{
            let airlineNames = rows;
            let response;
            fs.readFile(path.join(template,"/airline-info.html"), 'utf-8', (err, data)=>{
                let options = '';
                let number = 1;
                airlineNames.forEach(name => {
                    let urlName = name.airline.replace(' / ', '%20-%20');
                    urlName = urlName.replaceAll(' ', '%20');
                    options += "makeElement('option', {value:'"+number+"', text:'"+name.airline+"'}),\n";
                    number++;
                });
                response = data.replace('//$$OPTIONS$$', options);
                res.status(200).type('html').send(response);
            });
        }
    });
});

app.get('/km/:eq/:num/:page', (req, res)=>{
    let eq = req.params.eq
    let equality;
    let num = req.params.num;
    let page = req.params.page;
    let symb = '';
    if(eq == 'eq'){
        equality = '=';
        symb = '=';
    }else if(eq == 'lt'){
        equality = '<';
        symb = '<';
    }else if(eq == 'gt'){
        equality = '>';
        symb = '>';
    }else if(eq == 'lte'){
        equality = '<=';
        symb = '≤';
    }else if(eq == 'gte'){
        equality = '>=';
        symb = '≥';
    }
    
    let query='SELECT * From Airlines WHERE avail_seat_km_per_week '+equality+' ?';
    db.all(query, [num], (err, rows)=>{
        if(err){
            res.status(404).type('html').send("Query not found")
            console.log(err);
        }else{
            send(rows);
        }
    });

    let send = function(airlineData){
        fs.readFile(path.join(template,"/temp.html"), 'utf-8', (err, data)=>{
            let response;
            let pageInc = 10;
            let begin = (page-1)*pageInc;
            let prev = page==1?'<span style="color:gray">Prev</span>':'<a href="/km/'+eq+'/'+num+'/'+(parseInt(page)-1)+'">Prev</a>';
            let next = airlineData.length-10<=begin?'<span style="color:gray">Next</span>':'<a href="/km/'+eq+'/'+num+'/'+(parseInt(page)+1)+'">Next</a>';
            if(page<=0||begin >= airlineData.length){
                res.status(404).type('html').send("Could not find");
                return;
            }
            let graph = makeBarGraph(airlineData, "stackedBar", "airline",
                ["incidents_85_99",  "fatal_accidents_85_99",  "fatalities_85_99",
                "incidents_00_14",  "fatal_accidents_00_14",  "fatalities_00_14"],
                ["Incidents (1985-1999)", "Fatal Accidents (1985-1999)", "Fatalities (1985-1999)",
                "Incidents (2000-2014)", "Fatal Accidents (2000-2014)", "Fatalities (2000-2014)"],
                page, pageInc);
            response = data.replace('//$$GRAPH$$', graph);
            response = response.replace('$$PREV$$', prev);
            response = response.replace('$$NEXT$$', next);
            response = response.replace('$$TITLE$$', "Airline Data Filtered By Available Seat km/week: "+symb+num);
            res.status(200).type('html').send(response);
        });
    };

    const tr = "<tr>";
    const trEnd = "</tr>";
    const th = "<th>";
    const thEnd = "</th>";
    const td = "<td>";
    const tdEnd = "</td>";
    const newline = "\n";
    let makeTable = function(head, rows, labels){
        let table = "<table>"+newline;
        //make table head
        table += "<thead>"+newline;
        table += tr+newline+addTableList(head, th, thEnd, null)+trEnd+newline;
        table += "</thead>"+newline;
        //make table body
        table += "<tbody>"+newline;
        table += addTableList(rows, td, tdEnd, labels);
        table += "</tbody>"+newline;
        table += "</table>"+newline;

        return table;
    };
    let addTableList = function(data, begin, end, labels){
        let list = "";
        let makeRow;
        if(labels == null){
            makeRow = function(cellData){
                if(cellData != null){
                    list += begin+cellData+end+newline;
                }
            };
        }else{
            makeRow = function(cellData){
                list += tr+newline;
                labels.forEach(label => {
                    if(label != null){
                        list += begin+cellData[label]+end+newline;
                    }
                });
                list += trEnd+newline;
            };
        }
        data.forEach((cellData) => {
            makeRow(cellData);
        });
        return list;
    };

});


app.get('/airline/:page', (req, res)=>{
    let db_query = "SELECT * From Airlines"
    db.all(db_query, (err, rows)=>{
        if(err){
            res.status(404).type('html').send("Query not found")
            console.log(err);
        }else{
            // console.log(rows);
            send(rows);
        }
    });

    let send = function(airlineData){
        fs.readFile(path.join(template,"/temp.html"), 'utf-8', (err, data)=>{
            let response;
            let page = req.params.page;
            let pageInc = 1;
            let begin = (page-1)*pageInc;
            let prev = page==1?'<span style="color:gray">Prev</span>':'<a href="/airline/'+(parseInt(page)-1)+'">Prev</a>';
            let next = airlineData.length-pageInc<=begin?'<span style="color:gray">Next</span>':'<a href="/airline/'+(parseInt(page)+1)+'">Next</a>';
            if(page<=0||begin >= airlineData.length){
                res.status(404).type('html').send("Could not find");
                return;
            }

            let graph = makeBarGraph(airlineData, "column", "airline",
            ["incidents_85_99",  "fatal_accidents_85_99",  "fatalities_85_99",
            "incidents_00_14",  "fatal_accidents_00_14",  "fatalities_00_14"],
            ["Incidents (1985-1999)", "Fatal Accidents (1985-1999)", "Fatalities (1985-1999)",
            "Incidents (2000-2014)", "Fatal Accidents (2000-2014)", "Fatalities (2000-2014)"],
            page, pageInc);

            response = data.replace('//$$GRAPH$$', graph);
            response = response.replace('$$PREV$$', prev);
            response = response.replace('$$NEXT$$', next);
            response = response.replace('$$TITLE$$', "Airline Data Filtered By Airline: "+airlineData[page-1].airline);
            res.status(200).type('html').send(response);
        });
    };

    const tr = "<tr>";
    const trEnd = "</tr>";
    const th = "<th>";
    const thEnd = "</th>";
    const td = "<td>";
    const tdEnd = "</td>";
    const newline = "\n";
    let makeTable = function(head, rows, labels){
        let table = "<table>"+newline;
        //make table head
        table += "<thead>"+newline;
        table += tr+newline+addTableList(head, th, thEnd, null)+trEnd+newline;
        table += "</thead>"+newline;
        //make table body
        table += "<tbody>"+newline;
        table += addTableList(rows, td, tdEnd, labels);
        table += "</tbody>"+newline;
        table += "</table>"+newline;

        return table;
    };
    let addTableList = function(data, begin, end, labels){
        let list = "";
        let makeRow;
        if(labels == null){
            makeRow = function(cellData){
                if(cellData != null){
                    list += begin+cellData+end+newline;
                }
            };
        }else{
            makeRow = function(cellData){
                list += tr+newline;
                labels.forEach(label => {
                    if(label != null){
                        list += begin+cellData[label]+end+newline;
                    }
                });
                list += trEnd+newline;
            };
        }
        data.forEach((cellData) => {
            makeRow(cellData);
        });
        return list;
    };

});


app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
