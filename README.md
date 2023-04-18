# Jira CSV Migrator App

## Overview
Designed for easy jira migration

## Prerequsites
nodejs12+ installed

## How to use
1. (first use only) run `npm install` to install all of the node dependencies
2. Create *csv* folder in the root project directory
3. Put Jira Export file in csv folder and name it `jira-export.csv`
4. Run node app

```powershell

npm run app 

## or

node main

```

5. Wonder in the Miracle that is the `out.csv` and the `epic-out.csv` files
6. When importing into jira, be sure to import the `epic-out.csv` file first, it contains all the epics so the regular ticket imports will work properly
