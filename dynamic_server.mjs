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

let makeBarGraph = function(data, type, label, col, nickname, addKM, page, pageInc){
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
        columns.push({title:colData, labels:[], preferred:preferredData, y:[], km:[]});
    }
    //adds data into columns
    for(let i=b; i<e; i++){
        for(let j=0; j<columns.length; j++){
            let cellData = data[i];
            let colData = col[j];
            columns[j].labels.push(cellData[label]);
            columns[j].y.push(cellData[colData]);
            if(addKM != null){
                columns[j].km.push(cellData['avail_seat_km_per_week']);
            }
        }
    }
    //creating actual graph
    graphData = 'data:[\n';
    // graphData += '{toolTipContent: "test",\n';
    let q='\'\\"\'';
    for(let i=0; i<columns.length; i++){
        let column = columns[i];
        graphData += '{type:"'+type+'",\n';
        if(addKM){
            let addLabel = i != 0?'':'{label}<br/>';
            let addExtra = i != 0?'':'ASK / Week: {km}<br/>';
            graphData += 'toolTipContent: "'+addLabel+addExtra+'<span style='+q+'color: {color};'+q+'>{name}:</span> {y}",\n';
        }
        graphData += 'name:"'+ column.preferred+'",\n';
        graphData += 'showInLegend: "true",\ndataPoints: [\n';
        for(let j=0; j<column.labels.length; j++){
            let preferredKM = numFormat(column.km[j], addKM);
            graphData += '{ y:'+column.y[j]+', label: "'+column.labels[j]+'", km:"'+preferredKM+'"},\n';
        }
        graphData += ']\n';
        graphData += '},\n';
    }
    graphData += ']';
    return graphData;
};

let numFormat = function(num, style){
    let i = parseInt(num);
    num = i.toLocaleString('en-US');
    if(style != 'short'){
        return num;
    }
    if(i>=1000000000){
        return num = Math.floor(i*0.000000001)+'B';
    }else if(i>=1000000){
        return num = Math.floor(i*0.000001)+'M';
    }else if(i>=1000){
        return num = Math.floor(i*0.001)+'M';
    }
    return num;
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
            let prev = page==1?'<span class = "disabled-button">Prev</span>':
                '<a href="/km/'+eq+'/'+num+'/'+(parseInt(page)-1)+'"><span class="enabled-button">Prev</span></a>';
            let next = airlineData.length - pageInc <= begin?'<span class = "disabled-button">Next</span>':
                '<a href="/km/'+eq+'/'+num+'/'+(parseInt(page)+1)+'"><span class="enabled-button">Next</span></a>';
            if(page<=0||begin >= airlineData.length){
                res.status(404).type('html').send("Could not find");
                return;
            }
            let graph = makeBarGraph(airlineData, "stackedBar", "airline",
                ["incidents_85_99",  "fatal_accidents_85_99",  "fatalities_85_99",
                "incidents_00_14",  "fatal_accidents_00_14",  "fatalities_00_14"],
                ["Incidents (1985-1999)", "Fatal Accidents (1985-1999)", "Fatalities (1985-1999)",
                "Incidents (2000-2014)", "Fatal Accidents (2000-2014)", "Fatalities (2000-2014)"],
                "full", page, pageInc);
            response = data.replace('//$$GRAPH$$', graph);
            response = response.replace('$$PREV$$', prev);
            response = response.replace('$$NEXT$$', next);
            response = response.replace('$$TITLE$$', "Airline Data Filtered By Available Seat km/week: "+symb+num);
            res.status(200).type('html').send(response);
        });
    };
});

app.get('/airline/:page', (req, res)=>{
    let db_query = "SELECT * From Airlines"
    db.all(db_query, (err, rows)=>{
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
            let page = req.params.page;
            let pageInc = 1;
            let begin = (page-1)*pageInc;
            let prev = page==1?'<a><span class = "disabled-button">Prev</span></a>':
                '<a href="/airline/'+(parseInt(page)-1)+'"><span class="enabled-button">Prev</span></a>';
            let next = airlineData.length - pageInc <= begin?'<span class = "disabled-button">Next</span>':
                '<a href="/airline/'+(parseInt(page)+1)+'"><span class="enabled-button">Next</span></a>';
            if(page<=0||begin >= airlineData.length){
                res.status(404).type('html').send("Could not find");
                return;
            }

            let graph = makeBarGraph(airlineData, "column", "airline",
            ["incidents_85_99",  "fatal_accidents_85_99",  "fatalities_85_99",
            "incidents_00_14",  "fatal_accidents_00_14",  "fatalities_00_14"],
            ["Incidents (1985-1999)", "Fatal Accidents (1985-1999)", "Fatalities (1985-1999)",
            "Incidents (2000-2014)", "Fatal Accidents (2000-2014)", "Fatalities (2000-2014)"],
            "short", page, pageInc);

            response = data.replace('//$$GRAPH$$', graph);
            response = response.replace('$$PREV$$', prev);
            response = response.replace('$$NEXT$$', next);
            response = response.replace('$$TITLE$$', "Airline Data Filtered By Airline: "+airlineData[page-1].airline);
            res.status(200).type('html').send(response);
        });
    };

});

app.get('/date/:tf/:page', (req, res) => {
    let timeFrame = req.params.tf;
    let page = req.params.page;
    let query = '';
    let tableData = [];

    if (timeFrame == '1985-1999') {
        tableData = ["incidents_85_99", "fatal_accidents_85_99", "fatalities_85_99"];
        query = 'SELECT airline, incidents_85_99, fatal_accidents_85_99, fatalities_85_99, avail_seat_km_per_week FROM Airlines';
    } else if (timeFrame == '2000-2014') {
        query = 'SELECT airline, incidents_00_14, fatal_accidents_00_14, fatalities_00_14, avail_seat_km_per_week FROM Airlines';
        tableData = ["incidents_00_14", "fatal_accidents_00_14", "fatalities_00_14"];
    }

    db.all(query, (err, rows) => {
        if (err) {
          res.status(404).type('html').send("Query not found")
          console.log(err);
        } else {
          send(rows);
        }
    });

    let send = function (airlineData) {
        fs.readFile(path.join(template, "/temp.html"), 'utf-8', (err, data) => {
          let pageInc = 10;
          let begin = (page - 1) * pageInc;
          
          let prev = page == 1 ? '<span class = "disabled-button">Prev</span>' :
            '<a href="/date/' + timeFrame + '/' + (parseInt(page) - 1) + '"><span class="enabled-button">Prev</span></a>';
          let next = airlineData.length - pageInc <= begin ? '<span class = "disabled-button">Next</span>' :
            '<a href="/date/' + timeFrame + '/' + (parseInt(page) + 1) + '"><span class="enabled-button">Next</span></a>';
    
          if (page <= 0 || begin >= airlineData.length) {
            res.status(404).type('html').send("Could not find");
            return;
          }
    
          let response;
          let graph = makeBarGraph(airlineData, "stackedBar", "airline",
            tableData,
            ["Incidents (" + timeFrame + ")", "Fatal Accidents (" + timeFrame + ")", "Fatalities (" + timeFrame + ")"],
            "short", page, pageInc);
    
          response = data.replace('//$$GRAPH$$', graph);
          response = response.replace('$$PREV$$', prev);
          response = response.replace('$$NEXT$$', next);
          response = response.replace('$$TITLE$$', "Airline Data Filtered By Timeline: " + timeFrame);
          res.status(200).type('html').send(response);
        });
    };
    
});



app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
