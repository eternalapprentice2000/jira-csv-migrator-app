const _csv  = require("csvtojson");
const fs    = require("fs");
const fn    = "./csv/jira-export.csv";

let headersToExport = [
    "Summary",
    "Issue id",
    "Parent id",
    "Issue Type",
    "Assignee",
    "Reporter",
    "Due Date",
    "Description",
    "Labels"
];

let _addToArray = (currentArray, item) => {
    let result = currentArray || [];
            
    if (item !== undefined && item !== ""){
        result.push(item);
    }
    
    return result
}

let csv = _csv({ // basic processing on import, mostly useful for items with the same header to convert into arrays
    colParser : {
        "Comment" : (item, head, resultRow, row, colIndex) => {
            return  _addToArray(resultRow.Comment, item);
        },
        "Sprint" : (item, head, resultRow, row, colIndex) => {
            return _addToArray(resultRow.Sprint, item);
        },
        "Attachment" : (item, head, resultRow, row, colIndex) => {
            return _addToArray(resultRow.Attachment, item);
        },
        "Labels" : (item, head, resultRow, row, colIndex) => {
            return _addToArray(resultRow.Labels, item);
        },
    }
});

let _escapeQuotes = (str) => {
    return str.replace(/"/g, '""');
}

let writeCsv = (json, outFile) => {
    // getCounts for expandable fields
    let labelCount = 0;

    for(let index in json){
        let row = json[index];
        labelCount = row.Labels.length > labelCount ? row.Labels.length : labelCount;
    }

    let csvOut = [];

    csvOut.push([]); //headerLine
    // create headers
    for(let index in headersToExport){
        let header = headersToExport[index];

        if (header === "Labels"){
            // special case, need to expand these out to the max label count
            for(let a = 1; a <= labelCount; a++){
                csvOut[0].push("Labels");
            }
        } else {
            csvOut[0].push(header);
        }
    }

    // create the rest parse the json
    for(let i in json){
        let row = json[i];
        let writeCsvLine = [];
        for(let ii in headersToExport){
            let header = headersToExport[ii];
    
            if (header === "Labels"){
                // special case, need to expand these out to the max label count
                for(let a = 1; a <= labelCount; a++){
                    writeCsvLine.push(_escapeQuotes(row[header][a-1] || ""));
                }
            } else {
                writeCsvLine.push(_escapeQuotes(row[header]));
            }
        }

        csvOut.push(writeCsvLine);
    }

    // concat everything and wrap them in quotes 
    let outData = [];

    for(let i in csvOut){
        outData.push(`"${csvOut[i].join('","')}"`);
    }

    // write the file
    fs.writeFileSync(outFile, outData.join("\n"));
}

let main = async () => {

    let jiraJson = await csv.fromFile(fn).then(json => json);
    
    // need to convert some fields into labels
    for(let index in jiraJson){
        let row = jiraJson[index];
        // move status to label
        row.Labels.push(`Original Status: ${row.Status}`);

        // move Original backlog field to label
        row.Labels.push(`Original Backlog: ${row["Custom field (Backlog)"]}`);

        // move project name to labels
        row.Labels.push(`Original Project Name: ${row["Project name"]}`);

        // add link to old ticket to beginning of Description
        row.Description = `Original Ticket Link: <http://jira.b2b.regn.net:8080/browse/${row["Issue key"]}>\n\n${row.Description}`; 

        let dod = row["Custom field (Definition of Done)"];
        if (dod !== ""){
            // add the definition of done
            row.Description += `\n\n*Original Definition of Done*\n${row["Custom field (Definition of Done)"]}`;
        }

        row.Description += "\n\n*Imported Comments:*"    
        // add comments to description
        for(let index in row.Comment){
            let comment = row.Comment[index];
            row.Description += `\n ${comment}`;
        }

        // add attachments to Description
        row.Description += "\n\n*Imported Attachments:*"    
        for (let index in row.Attachment){
            let attachment = row.Attachment[index];
            row.Description += `\n ${attachment}`;
        }

        // map assignees/reports to new jira accounts
    }

    return writeCsv(jiraJson, "./csv/out.csv");
}

main().then(() => {
    console.log("done");
});