function createAlert(text, color){
    let alert = document.createElement("div")
    alert.style.backgroundColor = color;
    alert.style.border = "3px solid "+color;
    let textElem = document.createElement("p")
    textElem.innerText = text;
    alert.classList.add("alert");
    alert.appendChild(textElem);
    let quit = document.createElement("div");
    quit.classList.add("exit-button");
    quit.onclick = ()=>{
        document.body.removeChild(alert)
    }
    alert.appendChild(quit);
    document.body.appendChild(alert)
}

function createInfoAlert(text){
    createAlert(text, "#7777DD");
}

function createErrorAlert(text){
    createAlert(text, "#DD7777");
}

function createWarningAlert(text){
    createAlert(text, "#FFC067");
}

function createSuccessAlert(text){
    createAlert(text, "#77DD77")
}
