import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import { default as express } from "express";
import { default as sqlite3 } from "sqlite3";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const port = 8000;
const root = path.join(__dirname, "public");
const template = path.join(__dirname, "templates");
let app = express();
app.use(express.static(root));

const db = new sqlite3.Database(
  path.join(__dirname, "airline.sqlite3"),
  sqlite3.OPEN_READONLY,
  (err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log("Connected to the database.");
    }
  }
);


function dbSelect(query) {
  let p = new Promise((resolve, reject) => {
    db.all(query, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
  return p;
}

app.get('/:tf', (req, res)=>{
  let timeFrame = req.params.tf;
  let query = '';
  let tableData = [];

  if (timeFrame == '85'){
    timeFrame='85-99';
    tableData = ["airline", "incidents_85_99",  "fatal_accidents_85_99",  "fatalities_85_99"];
    query = `SELECT airline, incidents_85_99, fatal_accidents_85_99, fatalities_85_99 FROM Airlines`;
  }else if(timeFrame == '00'){
    timeFrame = '00-14';
    query = `SELECT airline, incidents_00_14, fatal_accidents_00_14, fatalities_00_14 FROM Airlines`;
    tableData = ["airline", "incidents_00_14",  "fatal_accidents_00_14",  "fatalities_00_14"];
  }
  
  db.all(query, (err, rows)=>{
      if(err){
          res.status(404).type('html').send("Query not found")
          console.log(err);
      }else{
          send(rows);
          console.log(calculateSumIncidents(rows));
          console.log(calculateSumFatalaccidents(rows));
          console.log(calculateSumFatalities(rows));
      }
  });
  function calculateSumIncidents(rows) {
    let sum = 0;
    rows.forEach((row) => {
      if (row.incidents_85_99) {
        sum += row.incidents_85_99;
      } else if (row.incidents_00_14) {
        sum += row.incidents_00_14;
      }
    });
    return sum;
  }

  function calculateSumFatalaccidents(rows) {
    let sum = 0;
    rows.forEach((row) => {
      if (row.fatal_accidents_85_99) {
        sum += row.fatal_accidents_85_99;
      } else if (row.fatal_accidents_00_14) {
        sum += row.fatal_accidents_00_14;
      }
    });
    return sum;
  }

  function calculateSumFatalities(rows) {
    let sum = 0;
    rows.forEach((row) => {
      if (row.fatalities_85_99) {
        sum += row.fatalities_85_99;
      } else if (row.fatalities_00_14) {
        sum += row.fatalities_00_14;
      }
    });
    return sum;
  }

  let send = function(airlineData){
      fs.readFile(path.join(template,"/temp.html"), 'utf-8', (err, data)=>{
          let response;
          let table = makeTable(
            ["Airline", "incidents", "fatal accidents", "fatalities"],
              airlineData,
              tableData
          );

          const chartData = {
            theme: "light1",
            animationEnabled: false,
            title: {
                text: "Airline Incidents"
            },
            data: [
                {
                    type: "column",
                    dataPoints: [
                        { label: "Incidents 85-99", y: calculateSumIncidents(airlineData) },
                        { label: "Fatal Accidents 85-99", y: calculateSumFatalaccidents(airlineData) },
                        { label: "Fatalities 85-99", y: calculateSumFatalities(airlineData) }
                    ]
                }
            ]
        };

          response = data.replace('$$GRAPH$$', JSON.stringify(chartData));
          response = response.replace('$$DATA$$', table);
          response = response.replace('$$TITLE$$', "Airline Incidents Filtered By Timeline: "+timeFrame);
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

//let p = dbSelect(query);

/*p.then((rows) => {
  console.log(rows);
});
*/
app.listen(port, () => {
  console.log("Now listening on port " + port);
});
