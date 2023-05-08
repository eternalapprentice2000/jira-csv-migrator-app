const _csv              = require("csvtojson");
const fs                = require("fs");
const fn                = "./csv/jira-export.csv";
const moment            = require("moment");

const importTeamName    = "Mase";

let headersToExport = [
    "Summary",
    "Issue id",
    "Parent id",
    "Epic Name",
    "Epic Link",
    "Issue Type",
    "Due Date",
    "Project key",
    "External Issue Id",
    "External Issue Link",
    "Description",
    "Labels",
    "Priority"
];

let _addToArray = (currentArray, item) => {
    let result = currentArray || [];
            
    if (item !== undefined && item !== ""){
        result.push(item);
    }
    
    return result
}

let _convertDate = (item) => {
    let dt = moment(item, "YYYY-MM-DD hh:mm a", false);

    if ((item || "") !== "" && !dt.isValid()){
        let k = 0;
    }

    if (dt.isValid()) {
        return dt.format("DD/MMM/YYYY");
    } else {
        return "";
    }
}

// this cleans up non standard emojis from the text.  It breaks the import
let _sanitize = (item) => {
    return item.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
}

let csv = _csv({ // basic processing on import, mostly useful for items with the same header to convert into arrays
    colParser : {
        "Comment" : (item, head, resultRow, row, colIndex) => {
            return  _addToArray(resultRow.Comment, _sanitize(item));
        },
        "Attachment" : (item, head, resultRow, row, colIndex) => {
            return _addToArray(resultRow.Attachment, _sanitize(item));
        },
        "Labels" : (item, head, resultRow, row, colIndex) => {
            return _addToArray(resultRow.Labels, _sanitize(item));
        },
        "Due Date" : (item, head, resultRow, row, colIndex) => {
            let dt = _convertDate(item);
            return dt;
        },
        "Priority" : (item, head, resultRow, row, colIndex) => {
            if (item === "Lowest") { // there is no "Lowest setting, "
                item = "Low"
            }
            return item;
        },
        "Description" : (item, head, resultRow, row, colIndex) => {
            // convert description to list of strings instead of string blob
        
            return _sanitize(item).split("\r\n");
        },
        "Issue Type" : (item, head, resultRow, row, colIndex) => {
            let subTaskConversionList = ["Meeting", "Pull Request Review"];
            return subTaskConversionList.indexOf(item) > -1 ? "Sub-task" : item;
        }
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
    return (str || "").replace(/"/g, '""');
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

    let headersCsvOut = [];
    let csvOut = [];
    let epicCsvOut = [];

    headersCsvOut.push([]); //headerLine
    // create headers
    for(let index in headersToExport){
        let header = headersToExport[index];

        if (header === "Labels"){
            // special case, need to expand these out to the max label count
            for(let a = 1; a <= labelCount; a++){
                headersCsvOut[0].push("Labels");
            }
        } else {
            headersCsvOut[0].push(header);
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
            } else if (header === "Description"){
                // description is an array, need to markdownify it
                let description = row[header].join("  \r\n");
                writeCsvLine.push(_escapeQuotes(description));
            } else {
                writeCsvLine.push(_escapeQuotes(row[header]));
            }
        }

        if (row["Issue Type"] === "Epic"){
            epicCsvOut.push(writeCsvLine);
        } else {
            csvOut.push(writeCsvLine);
        }
    }

    // concat everything and wrap them in quotes 
    let outData = [];

    // headers
    for(let i in headersCsvOut){
        outData.push(`"${headersCsvOut[i].join('","')}"`);
    }

    // epics
    for(let i in epicCsvOut){
        outData.push(`"${epicCsvOut[i].join('","')}"`);
    }

    // everything else
    for(let i in csvOut){
        outData.push(`"${csvOut[i].join('","')}"`);
    }

    // write the file
    fs.writeFileSync(outFile, outData.join("\r\n"));
}

let main = async () => {

    let jiraJson = await csv.fromFile(fn).then(json => json);
    let epicMap = {};
    
    // need to convert some fields into labels
    for(let index in jiraJson){
        let row = jiraJson[index];
        // adding imported automatically label

        if (row.Labels === undefined) {
            row.Labels = [];
        }
        row.Labels.push("sbs-jira-imported");

        // move status to label
        row.Labels.push(_createStub(`Status ${row.Status}`));

        // move Original backlog field to label
        row.Labels.push(_createStub(`Backlog ${row["Custom field (Backlog)"]}`));

        // add assignee and reporter to labels
        row.Labels.push(_createStub(`Assignee ${row["Assignee"]}`));
        row.Labels.push(_createStub(`Reporter ${row["Reporter"]}`));
        row.Labels.push(_createStub(`Team Assigned ${importTeamName}`));

        // epic name needs to exist, and then we need to map it to a ticket id
        // this will matter later
        row["Epic Name"] = "";

        if (row["Issue Type"] === "Epic") {
            // add to epic map
            epicMap[row["Issue key"].toLowerCase()] = row.Summary;
            row["Epic Name"] = row.Summary;
        }

        row["External Issue Id"] = row["Issue key"];
        row["External Issue Link"] = `http://jira.b2b.regn.net:8080/browse/${row["Issue key"]}`;

        // add DOD if it exists
        if (row["Custom field (Definition of Done)"] !== ""){
            // add the definition of done
            row.Description.push("");
            row.Description.push("*Original Definition of Done*");
            row.Description.push(row["Custom field (Definition of Done)"]);
            row.Description.push("");
        }

        // add comments if they exist
        if ((row.Comment || []).length > 0){
            row.Description.push("*Imported Comments:*");
            row.Description.push("");   
            // add comments to description
            for(let index in row.Comment){
                let comment = _parseComments(row.Comment[index]);
    
                row.Description.push(`${comment.date} **${comment.createdBy}** :`);
                row.Description.push(`${comment.comment}`);
                row.Description.push("");
            }
        }

        // add attachment links if they exist
        if ((row.Attachment || []).length > 0){
            row.Description.push("*Imported Attachments:*");
            row.Description.push("");    
            for (let index in row.Attachment){
                let attachment = _parseAttachment(row.Attachment[index]);
                row.Description.push(`${attachment.date} **${attachment.createdBy}** :`);
                row.Description.push(`Attachment Name: ${attachment.imageName}`);
                row.Description.push(`Attachment Link: <${attachment.imageLink}>`);
                row.Description.push("");
            }
        }
    }

    // need to update epic links in tickets with epics
    for(let index in jiraJson){
        let row = jiraJson[index];

        let epicLink = row["Custom field (Epic Link)"];

        row["Epic Link"] = "";

        if ((epicLink || "") !== ""){
            row["Epic Link"] = epicMap[epicLink.toLowerCase()]
        }
    }

    return writeCsv(jiraJson, "./csv/out.csv");
}

main().then(() => {
    console.log("done");
});
