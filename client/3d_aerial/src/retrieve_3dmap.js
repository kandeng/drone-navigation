// retrieve_3dmap.js
import config from '../../config.json';

const SESSION_URL = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${config.googleApiKey}`;

async function verifyGoogle3DTiles() {
    console.log(`[${new Date().toISOString()}] Initiating connection test to Google Maps Platform API...`);
    console.log(`Target URL: https://tile.googleapis.com/v1/3dtiles/root.json\n`);

    try {
        const response = await fetch(SESSION_URL, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Node.js Headless Tiles Verification)'
            }
        });

        console.log(`--> Server Response Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log(`\n✅ SUCCESS: Connection handshake established!`);
            console.log(`--> Asset Format Type: ${data.asset?.version || 'Unknown'}`);
            console.log(`--> Geometric Error Bounds: ${data.geometricError}`);
            console.log(`--> Root Content URI Node: ${data.root?.content?.uri || 'Present'}`);
            console.log(`\nConclusion: The network routing is fully transparent to Google's server pool.`);
        } else {
            const errorText = await response.text();
            console.log(`\n❌ API ERROR: Connected to Google, but request was rejected.`);
            console.log(`--> Error Details:\n${errorText}`);
        }
    } catch (error) {
        console.log(`\n❌ NETWORK FAILURE: Unable to contact the remote host.`);
        console.log(`--> Diagnostic Error Message: ${error.message}`);
        console.log(`\nConclusion: The IP route is blocked or timed out at the packet/carrier tier.`);
    }
}

verifyGoogle3DTiles();