' ============================================================
' PE Fund Data Extractor - VBA Module
' ============================================================
' This module contains two main export functions:
'   1. ExportFundsToJSON - Process a single workbook (current workbook)
'   2. ExportFolderToJSON - Process all Excel files in a folder
'
' To use: Import this .bas file into Excel (Developer > Visual Basic >
'         File > Import File) or copy the code into a new module.
' ============================================================

' ============================================================
' CONFIGURATION - Edit this section to change column mappings
' ============================================================
' Format: Column Letter, Type (Contribution/Distribution), Affects Commitment (True/False), Description
' Add or remove rows as needed

' To add a new column:
' Add a new row: config(7, 1) = "X": config(7, 2) = "Distribution": config(7, 3) = False: config(7, 4) = "New Type"
' Change the array size from (1 To 6, 1 To 4) to (1 To 7, 1 To 4)
' Update CONFIG_COUNT from 6 to 7
' To remove a column: Delete the row and renumber, update the array size and CONFIG_COUNT.

Function GetCashFlowConfig() As Variant
    Dim config(1 To 6, 1 To 4) As Variant

    '        Column    Type              Affects Commitment   Description
    config(1, 1) = "M": config(1, 2) = "Contribution": config(1, 3) = True:  config(1, 4) = "Capital Call"
    config(2, 1) = "O": config(2, 2) = "Contribution": config(2, 3) = False: config(2, 4) = "Interest"
    config(3, 1) = "P": config(3, 2) = "Contribution": config(3, 3) = False: config(3, 4) = "Fee"
    config(4, 1) = "Q": config(4, 2) = "Contribution": config(4, 3) = False: config(4, 4) = "Fee"
    config(5, 1) = "S": config(5, 2) = "Distribution": config(5, 3) = True:  config(5, 4) = "Recallable Distribution"
    config(6, 1) = "T": config(6, 2) = "Distribution": config(6, 3) = False: config(6, 4) = "Distribution"

    GetCashFlowConfig = config
End Function

' Number of configured columns (update this if you add/remove rows above)
Const CONFIG_COUNT As Integer = 6

' Other settings
Const DATE_COLUMN As String = "B"
Const NAV_COLUMN As String = "G"
Const START_ROW As Integer = 18
Const END_ROW As Integer = 290

' ============================================================
' END CONFIGURATION
' ============================================================

' ============================================================
' BATCH PROCESSING - Process all Excel files in a folder
' ============================================================

Sub ExportFolderToJSON()
    ' Prompts user to select a folder, then processes all Excel files in it
    ' and combines the results into a single JSON export file.

    Dim folderPath As String
    Dim outputFile As String
    Dim fso As Object
    Dim folder As Object
    Dim file As Object
    Dim wb As Workbook
    Dim json As String
    Dim fundsJson As String
    Dim groups As Object
    Dim totalFundCount As Integer
    Dim fileCount As Integer
    Dim isFirstFund As Boolean
    Dim processedFiles As String
    Dim skippedFiles As String
    Dim fileExt As String

    ' Let user select folder
    With Application.FileDialog(msoFileDialogFolderPicker)
        .Title = "Select Folder Containing Excel Files"
        .AllowMultiSelect = False
        If .Show = -1 Then
            folderPath = .SelectedItems(1)
        Else
            Exit Sub ' User cancelled
        End If
    End With

    ' Ensure folder path ends with backslash
    If Right(folderPath, 1) <> "\" Then folderPath = folderPath & "\"

    ' Initialize
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set folder = fso.GetFolder(folderPath)
    Set groups = CreateObject("Scripting.Dictionary")

    totalFundCount = 0
    fileCount = 0
    isFirstFund = True
    processedFiles = ""
    skippedFiles = ""

    ' Disable screen updating for performance
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.EnableEvents = False

    ' Start JSON
    json = "{" & vbCrLf & "  ""funds"": ["

    ' Process each Excel file in the folder
    For Each file In folder.Files
        fileExt = LCase(fso.GetExtensionName(file.Name))

        ' Only process Excel files
        If fileExt = "xlsx" Or fileExt = "xls" Or fileExt = "xlsm" Or fileExt = "xlsb" Then
            On Error Resume Next
            Set wb = Workbooks.Open(file.Path, ReadOnly:=True, UpdateLinks:=False)
            On Error GoTo 0

            If Not wb Is Nothing Then
                ' Extract funds from this workbook
                Dim result As Variant
                result = ExtractFundsFromWorkbook(wb, groups, isFirstFund)

                fundsJson = result(0)
                Dim fundCountFromFile As Integer
                fundCountFromFile = result(1)
                isFirstFund = result(2)

                If fundCountFromFile > 0 Then
                    json = json & fundsJson
                    totalFundCount = totalFundCount + fundCountFromFile
                    fileCount = fileCount + 1
                    processedFiles = processedFiles & vbCrLf & "  - " & file.Name & " (" & fundCountFromFile & " funds)"
                Else
                    skippedFiles = skippedFiles & vbCrLf & "  - " & file.Name & " (no valid funds)"
                End If

                wb.Close SaveChanges:=False
                Set wb = Nothing
            Else
                skippedFiles = skippedFiles & vbCrLf & "  - " & file.Name & " (could not open)"
            End If
        End If
    Next file

    ' Re-enable Excel features
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    Application.EnableEvents = True

    ' Complete JSON structure
    json = json & vbCrLf & "  ]," & vbCrLf

    ' Add groups array
    json = json & BuildGroupsJson(groups)
    json = json & vbCrLf & "}"

    ' Check if any funds were found
    If totalFundCount = 0 Then
        MsgBox "No funds found in any Excel files in:" & vbCrLf & folderPath & vbCrLf & vbCrLf & _
               "Make sure the files contain worksheets starting with 'A' that have valid fund data.", _
               vbExclamation, "No Data Found"
        Exit Sub
    End If

    ' Save to file
    outputFile = Application.GetSaveAsFilename( _
        InitialFileName:=folderPath & "pe_fund_export_combined.json", _
        FileFilter:="JSON Files (*.json), *.json", _
        Title:="Save Combined Export As")

    If outputFile <> "False" Then
        Dim ts As Object
        Set ts = fso.CreateTextFile(outputFile, True, True)  ' Unicode/UTF-8
        ts.Write json
        ts.Close

        Dim summaryMsg As String
        summaryMsg = "Export Complete!" & vbCrLf & vbCrLf & _
                     "Total: " & totalFundCount & " funds from " & fileCount & " files" & vbCrLf & _
                     "Groups: " & groups.Count & vbCrLf & vbCrLf & _
                     "Saved to:" & vbCrLf & outputFile

        If processedFiles <> "" Then
            summaryMsg = summaryMsg & vbCrLf & vbCrLf & "Processed files:" & processedFiles
        End If

        If skippedFiles <> "" Then
            summaryMsg = summaryMsg & vbCrLf & vbCrLf & "Skipped files:" & skippedFiles
        End If

        MsgBox summaryMsg, vbInformation, "Folder Export Complete"
    End If
End Sub

' ============================================================
' HELPER FUNCTION - Extract funds from a single workbook
' ============================================================

Function ExtractFundsFromWorkbook(wb As Workbook, ByRef groups As Object, ByVal isFirstFund As Boolean) As Variant
    ' Extracts all fund data from a workbook and returns:
    ' Array(0) = JSON string for funds
    ' Array(1) = Count of funds extracted
    ' Array(2) = Updated isFirstFund flag

    Dim ws As Worksheet
    Dim fundJson As String
    Dim cashFlowJson As String
    Dim navJson As String
    Dim fullJson As String
    Dim fundCount As Integer
    Dim i As Long
    Dim j As Integer
    Dim cellDate As Variant
    Dim cellValue As Variant
    Dim navValue As Variant
    Dim fundName As String
    Dim accountNumber As String
    Dim commitment As Double
    Dim groupName As String
    Dim isFirstCashFlow As Boolean
    Dim isFirstNav As Boolean
    Dim cashFlowCount As Integer
    Dim config As Variant
    Dim colLetter As String
    Dim cfType As String
    Dim affectsCommitment As Boolean
    Dim cfDescription As String
    Dim amount As Double
    Dim result(0 To 2) As Variant

    ' Load configuration
    config = GetCashFlowConfig()

    fullJson = ""
    fundCount = 0

    ' Loop through all sheets starting with "A"
    For Each ws In wb.Worksheets
        If Left(ws.Name, 1) = "A" Then
            ' Get fund metadata
            groupName = Trim(CStr(ws.Range("J2").Value))
            fundName = Trim(CStr(ws.Range("J4").Value))
            accountNumber = Trim(CStr(ws.Range("K4").Value))
            commitment = Val(ws.Range("K14").Value)

            ' Skip if no fund name
            If fundName = "" Then GoTo NextSheet

            ' Skip template/empty sheets where client name is "Client Name"
            If accountNumber = "Client Name" Then GoTo NextSheet

            ' Count cash flows first to skip empty sheets
            cashFlowCount = 0
            For i = START_ROW To END_ROW
                cellDate = ws.Range(DATE_COLUMN & i).Value
                If IsDate(cellDate) Then
                    For j = 1 To CONFIG_COUNT
                        colLetter = config(j, 1)
                        cellValue = ws.Range(colLetter & i).Value
                        If IsNumeric(cellValue) And cellValue <> 0 Then
                            cashFlowCount = cashFlowCount + 1
                        End If
                    Next j
                End If
            Next i

            ' Skip sheets with no cash flows
            If cashFlowCount = 0 Then GoTo NextSheet

            ' Track unique groups
            If groupName <> "" And Not groups.Exists(groupName) Then
                groups.Add groupName, groupName
            End If

            ' Start fund object
            If Not isFirstFund Then
                fundJson = "," & vbCrLf
            Else
                fundJson = vbCrLf
                isFirstFund = False
            End If

            fundJson = fundJson & "    {" & vbCrLf
            fundJson = fundJson & "      ""fundName"": """ & EscapeJson(fundName) & """," & vbCrLf
            fundJson = fundJson & "      ""accountNumber"": """ & EscapeJson(accountNumber) & """," & vbCrLf
            fundJson = fundJson & "      ""groupName"": """ & EscapeJson(groupName) & """," & vbCrLf
            fundJson = fundJson & "      ""commitment"": " & commitment & "," & vbCrLf

            ' Build cash flows array
            fundJson = fundJson & "      ""cashFlows"": ["
            isFirstCashFlow = True

            For i = START_ROW To END_ROW
                cellDate = ws.Range(DATE_COLUMN & i).Value

                ' Skip rows without a date
                If IsDate(cellDate) Then
                    ' Process each configured column
                    For j = 1 To CONFIG_COUNT
                        colLetter = config(j, 1)
                        cfType = config(j, 2)
                        affectsCommitment = config(j, 3)
                        cfDescription = config(j, 4)

                        cellValue = ws.Range(colLetter & i).Value

                        If IsNumeric(cellValue) And cellValue <> 0 Then
                            ' Determine amount sign based on type
                            If cfType = "Contribution" Then
                                amount = -Abs(cellValue)  ' Contributions are negative
                            Else
                                amount = Abs(cellValue)   ' Distributions are positive
                            End If

                            If Not isFirstCashFlow Then
                                cashFlowJson = ","
                            Else
                                cashFlowJson = ""
                                isFirstCashFlow = False
                            End If

                            cashFlowJson = cashFlowJson & vbCrLf & "        {"
                            cashFlowJson = cashFlowJson & """date"": """ & Format(cellDate, "yyyy-mm-dd") & """, "
                            cashFlowJson = cashFlowJson & """amount"": " & amount & ", "
                            cashFlowJson = cashFlowJson & """type"": """ & cfType & """, "
                            cashFlowJson = cashFlowJson & """affectsCommitment"": " & LCase(CStr(affectsCommitment)) & "}"
                            fundJson = fundJson & cashFlowJson
                        End If
                    Next j
                End If
            Next i

            If Not isFirstCashFlow Then
                fundJson = fundJson & vbCrLf & "      "
            End If
            fundJson = fundJson & "]," & vbCrLf

            ' Build NAV array
            fundJson = fundJson & "      ""monthlyNav"": ["
            isFirstNav = True

            For i = START_ROW To END_ROW
                cellDate = ws.Range(DATE_COLUMN & i).Value
                navValue = ws.Range(NAV_COLUMN & i).Value

                If IsDate(cellDate) And IsNumeric(navValue) And navValue <> 0 Then
                    If Not isFirstNav Then
                        navJson = ","
                    Else
                        navJson = ""
                        isFirstNav = False
                    End If
                    navJson = navJson & vbCrLf & "        {"
                    navJson = navJson & """date"": """ & Format(cellDate, "yyyy-mm-dd") & """, "
                    navJson = navJson & """amount"": " & navValue & "}"
                    fundJson = fundJson & navJson
                End If
            Next i

            If Not isFirstNav Then
                fundJson = fundJson & vbCrLf & "      "
            End If
            fundJson = fundJson & "]" & vbCrLf
            fundJson = fundJson & "    }"

            fullJson = fullJson & fundJson
            fundCount = fundCount + 1
        End If
NextSheet:
    Next ws

    result(0) = fullJson
    result(1) = fundCount
    result(2) = isFirstFund

    ExtractFundsFromWorkbook = result
End Function

' ============================================================
' HELPER FUNCTION - Build groups JSON array
' ============================================================

Function BuildGroupsJson(groups As Object) As String
    Dim json As String
    Dim groupKeys As Variant
    Dim isFirstGroup As Boolean
    Dim i As Long

    json = "  ""groups"": ["
    isFirstGroup = True

    If groups.Count > 0 Then
        groupKeys = groups.Keys
        For i = LBound(groupKeys) To UBound(groupKeys)
            If Not isFirstGroup Then
                json = json & ","
            Else
                isFirstGroup = False
            End If
            json = json & vbCrLf & "    {""name"": """ & EscapeJson(CStr(groupKeys(i))) & """, ""parentGroupId"": null}"
        Next i
        json = json & vbCrLf & "  "
    End If
    json = json & "]"

    BuildGroupsJson = json
End Function

' ============================================================
' SINGLE FILE PROCESSING - Process current workbook only
' ============================================================

Sub ExportFundsToJSON()
    ' Original function - exports funds from the current workbook only

    Dim jsonFile As String
    Dim fso As Object
    Dim ts As Object
    Dim json As String
    Dim groups As Object
    Dim fundCount As Integer
    Dim isFirstFund As Boolean
    Dim result As Variant

    ' Create dictionary for unique groups
    Set groups = CreateObject("Scripting.Dictionary")

    ' Start JSON
    json = "{" & vbCrLf & "  ""funds"": ["
    isFirstFund = True

    ' Extract funds from current workbook
    result = ExtractFundsFromWorkbook(ThisWorkbook, groups, isFirstFund)

    json = json & result(0)
    fundCount = result(1)

    json = json & vbCrLf & "  ]," & vbCrLf

    ' Add groups array
    json = json & BuildGroupsJson(groups)
    json = json & vbCrLf & "}"

    ' Check if any funds were found
    If fundCount = 0 Then
        MsgBox "No funds found in this workbook." & vbCrLf & vbCrLf & _
               "Make sure there are worksheets starting with 'A' that have valid fund data.", _
               vbExclamation, "No Data Found"
        Exit Sub
    End If

    ' Save to file
    jsonFile = Application.GetSaveAsFilename( _
        InitialFileName:="pe_fund_export.json", _
        FileFilter:="JSON Files (*.json), *.json")

    If jsonFile <> "False" Then
        Set fso = CreateObject("Scripting.FileSystemObject")
        Set ts = fso.CreateTextFile(jsonFile, True, True)  ' Unicode/UTF-8
        ts.Write json
        ts.Close
        MsgBox "Exported " & fundCount & " funds and " & groups.Count & " groups to:" & vbCrLf & jsonFile, vbInformation
    End If
End Sub

' ============================================================
' UTILITY FUNCTION - Escape special characters for JSON
' ============================================================

Function EscapeJson(s As String) As String
    ' Escape special characters for JSON
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCr, "\r")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    EscapeJson = s
End Function
