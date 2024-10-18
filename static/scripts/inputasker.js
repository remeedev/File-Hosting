function askInput(queryTitle, queries = [], callback = console.log){
    let shadowBox = document.createElement("div")
    shadowBox.id = "inputShadow"
    let container = document.createElement("div")
    container.id = 'inputContainer'
    let header = document.createElement("div")
    let exit = document.createElement("p")
    let title = document.createElement("h1")
    exit.id = "exit"
    exit.onclick = ()=>{
        document.body.removeChild(shadowBox)
    }
    title.innerText = queryTitle
    header.appendChild(title)
    header.appendChild(exit)
    container.appendChild(header)
    for (let i = 0; i < queries.length; i++){
        let input = document.createElement("input")
        input.type = queries[i].toLowerCase().includes("password") ? "password" : "text";
        input.placeholder = queries[i];
        container.appendChild(input);
    }
    let submit = document.createElement("button")
    submit.innerText = "submit"
    let quit = document.createElement("button")
    quit.innerText = "quit"
    quit.onclick = exit.onclick
    submit.onclick = ()=>{
        let entries = container.getElementsByTagName("input")
        let entryValues = []
        for (let i = 0; i < entries.length; i++){
            if (entries[i].value == ''){
                createErrorAlert("Can't leave spaces blank!")
                return
            }
            entryValues.push(entries[i].value)
        }
        callback(entryValues);
        quit.onclick()
    }
    container.appendChild(submit)
    container.appendChild(quit)
    shadowBox.appendChild(container)
    document.body.appendChild(shadowBox)
}
