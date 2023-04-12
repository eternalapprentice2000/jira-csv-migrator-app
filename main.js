const _csv  = require("csvtojson");
const fs    = require("fs");
const fn    = "./csv/jira-export.csv";

let headersToExport = [
    "Summary",
    "Issue id",
    "Parent id",
    "Epic Name",
    "Epic Link",
    "Issue Type",
    // "Assignee",
    // "Reporter",
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
        // not importing the sprint maybe
        // "Sprint" : (item, head, resultRow, row, colIndex) => {
        //     return _addToArray(resultRow.Sprint, item);
        // },
        "Attachment" : (item, head, resultRow, row, colIndex) => {
            return _addToArray(resultRow.Attachment, item);
        },
        "Labels" : (item, head, resultRow, row, colIndex) => {
            return _addToArray(resultRow.Labels, item);
        },
    }
});

let _parseComments = (comment) => {
    let parts = comment.split(";");

    return {
        date        : parts[0],
        createdBy   : parts[1],
        comment     : parts[2]
    }
}

let _parseAttachment = (attachment) => {
    let parts = attachment.split(";");

    return {
        date        : parts[0],
        createdBy   : parts[1],
        imageName   : parts[2],
        imageLink   : parts[3]

    }
}

let _escapeQuotes = (str) => {
    return str.replace(/"/g, '""');
}

let _createStub = (str) => {
    return `${str}`.replace(/ /g, "-").toLowerCase()
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
    let epicMap = {};
    
    // need to convert some fields into labels
    for(let index in jiraJson){
        let row = jiraJson[index];
        // adding imported automatically label
        row.Labels.push("sbs-jira-imported");

        // move status to label
        row.Labels.push(_createStub(`Status ${row.Status}`));

        // move Original backlog field to label
        row.Labels.push(_createStub(`Backlog ${row["Custom field (Backlog)"]}`));

        // move project name to labels
        row.Labels.push(_createStub(`Project Name ${row["Project name"]}`));

        // add assignee and reporter to labels
        row.Labels.push(_createStub(`Assignee ${row["Assignee"]}`));
        row.Labels.push(_createStub(`Reporter ${row["Reporter"]}`));

        // epic name needs to exist, and then we need to map it to a ticket id
        // this will matter later
        row["Epic Name"] = "";

        if (row["Issue Type"] === "Epic") {
            // add to epic map
            let stub = _createStub(row.Summary);
            epicMap[row["Issue key"].toLowerCase()] = stub;
            row["Epic Name"] = stub;
        }

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
            let comment = _parseComments(row.Comment[index]);

            row.Description += `\n ${comment.date} **${comment.createdBy}** :`;
            row.Description += `\n ${comment.comment}`;
        }

        // add attachments to Description
        row.Description += "\n\n*Imported Attachments:*"    
        for (let index in row.Attachment){
            let attachment = _parseAttachment(row.Attachment[index]);
            row.Description += `\n ${attachment.date} **${attachment.createdBy}** :`;
            row.Description += `\n Attachment Name: ${attachment.imageName}`;
            row.Description += `\n Attachment Link: <${attachment.imageLink}>`;
        }

        // map assignees/reports to new jira accounts
    }

    // need to update epic links in tickets with epics
    for(let index in jiraJson){
        let row = jiraJson[index];

        let epicLink = row["Custom field (Epic Link)"];

        row["Epic Link"] = "";

        if (epicLink !== undefined && epicLink !== ""){
            row["Epic Link"] = epicMap[epicLink.toLowerCase()]
        }
    }

    return writeCsv(jiraJson, "./csv/out.csv");
}

main().then(() => {
    console.log("done");
});