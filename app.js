async function connectWallet() {
  try {
    if (!window.opnet) {
      alert("OP_NET Wallet Extension not detected.");
      return;
    }

    let accounts;

    // Case 1: MetaMask-style request method
    if (typeof window.opnet.request === "function") {
      accounts = await window.opnet.request({
        method: "requestAccounts"
      });
    }

    // Case 2: connect() method
    else if (typeof window.opnet.connect === "function") {
      accounts = await window.opnet.connect();
    }

    // Case 3: getAccounts() method
    else if (typeof window.opnet.getAccounts === "function") {
      accounts = await window.opnet.getAccounts();
    }

    // Case 4: enable() method
    else if (typeof window.opnet.enable === "function") {
      await window.opnet.enable();
      if (typeof window.opnet.getAccounts === "function") {
        accounts = await window.opnet.getAccounts();
      }
    }

    else {
      alert("Unsupported OP_NET wallet API.");
      return;
    }

    if (!accounts || accounts.length === 0) {
      alert("No accounts returned from wallet.");
      return;
    }

    const address = accounts[0];

    // Save to localStorage
    localStorage.setItem("opnet_wallet", address);

    // Display shortened address
    const shortAddress =
      address.slice(0, 6) + "..." + address.slice(-4);

    document.getElementById("walletAddress").innerText =
      shortAddress;

    alert("Wallet Connected: " + shortAddress);

  } catch (error) {
    console.error("Connection Error:", error);
    alert("Connection failed. Check console.");
  }
}
