(() => {
  let promptDialog = null;
  let promptForm = null;
  let promptTitle = null;
  let promptMessage = null;
  let promptInput = null;
  let promptCancel = null;
  let promptSubmit = null;

  function ensurePromptDialog() {
    if (promptDialog) {
      return;
    }

    promptDialog = document.createElement("dialog");
    promptDialog.className = "impala-prompt-dialog";
    promptDialog.setAttribute("aria-labelledby", "impala-prompt-title");

    promptForm = document.createElement("form");
    promptForm.className = "impala-prompt-form";
    promptForm.method = "dialog";

    const header = document.createElement("div");
    header.className = "impala-prompt-heading";

    promptTitle = document.createElement("h2");
    promptTitle.id = "impala-prompt-title";

    promptMessage = document.createElement("p");
    promptMessage.className = "impala-prompt-message";

    const label = document.createElement("label");
    label.className = "impala-prompt-label";
    label.setAttribute("for", "impala-prompt-input");
    label.textContent = "Name";

    promptInput = document.createElement("input");
    promptInput.id = "impala-prompt-input";
    promptInput.className = "impala-prompt-input";
    promptInput.type = "text";
    promptInput.autocomplete = "off";

    const footer = document.createElement("div");
    footer.className = "impala-prompt-footer";

    promptCancel = document.createElement("button");
    promptCancel.type = "button";
    promptCancel.textContent = "Cancel";

    promptSubmit = document.createElement("button");
    promptSubmit.type = "submit";
    promptSubmit.textContent = "OK";

    header.appendChild(promptTitle);
    footer.appendChild(promptCancel);
    footer.appendChild(promptSubmit);
    promptForm.appendChild(header);
    promptForm.appendChild(promptMessage);
    promptForm.appendChild(label);
    promptForm.appendChild(promptInput);
    promptForm.appendChild(footer);
    promptDialog.appendChild(promptForm);
    document.body.appendChild(promptDialog);
  }

  function promptText(options = {}) {
    ensurePromptDialog();

    return new Promise((resolve) => {
      const defaultValue = String(options.defaultValue || "");
      let resolved = false;

      promptTitle.textContent = options.title || "Enter a value";
      promptMessage.textContent = options.message || "";
      promptMessage.hidden = !promptMessage.textContent;
      promptInput.value = defaultValue;
      promptInput.placeholder = options.placeholder || "";
      promptCancel.textContent = options.cancelLabel || "Cancel";
      promptSubmit.textContent = options.confirmLabel || "OK";

      function finish(value) {
        if (resolved) {
          return;
        }
        resolved = true;
        promptForm.removeEventListener("submit", handleSubmit);
        promptCancel.removeEventListener("click", handleCancel);
        promptDialog.removeEventListener("cancel", handleCancel);
        promptDialog.removeEventListener("close", handleClose);
        resolve(value);
      }

      function handleSubmit(event) {
        event.preventDefault();
        promptDialog.close("submit");
        finish(promptInput.value);
      }

      function handleCancel(event) {
        event.preventDefault();
        promptDialog.close("cancel");
        finish(null);
      }

      function handleClose() {
        if (promptDialog.returnValue !== "submit") {
          finish(null);
        }
      }

      promptForm.addEventListener("submit", handleSubmit);
      promptCancel.addEventListener("click", handleCancel);
      promptDialog.addEventListener("cancel", handleCancel);
      promptDialog.addEventListener("close", handleClose);

      promptDialog.showModal();
      window.setTimeout(() => {
        promptInput.focus();
        promptInput.select();
      }, 0);
    });
  }

  function choose(options = {}) {
	const dialog = document.createElement("dialog");
	dialog.className = "impala-prompt-dialog";
	const form = document.createElement("form");
	form.className = "impala-prompt-form";
	form.method = "dialog";
	const heading = document.createElement("h2");
	heading.textContent = options.title || "Choose an option";
	const message = document.createElement("p");
	message.className = "impala-prompt-message";
	message.textContent = options.message || "";
	const footer = document.createElement("div");
	footer.className = "impala-prompt-footer impala-choice-footer";
	form.append(heading, message, footer);
	dialog.appendChild(form);
	document.body.appendChild(dialog);
	return new Promise((resolve) => {
		let resolved = false;
		const finish = (value) => {
			if (resolved) return;
			resolved = true;
			dialog.close();
			dialog.remove();
			resolve(value);
		};
		(options.choices || []).forEach((choice) => {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = choice.label;
			if (choice.primary) button.classList.add("is-primary");
			button.addEventListener("click", () => finish(choice.value));
			footer.appendChild(button);
		});
		dialog.addEventListener("cancel", (event) => {
			event.preventDefault();
			finish(options.cancelValue ?? null);
		});
		dialog.showModal();
	});
  }

  window.ImpalaDialog = {
	prompt: promptText,
	choose
  };
})();
