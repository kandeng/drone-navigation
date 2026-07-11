# Drone Navigation

## Prerequisite

This project needs two external credentials. Set them in `client/config.json` (this file is gitignored; use `client/config.example.json` as a template).

### 1. Google Maps API key

Required APIs to enable on the same key:

- **Map Tiles API** — loads Google Photorealistic 3D Tiles in Cesium.
- **Maps JavaScript API** — loads the interactive Street View panorama during takeoff/landing and the 2D map toggle.

#### Step-by-step

1. Go to the Google Cloud Console: https://console.cloud.google.com/
2. Create a new project or select an existing one.
3. Set up a billing account if you have not already:
   - Open the navigation menu → **Billing** → **Manage billing accounts**.
   - Follow the prompts to add a payment method.
   - Link the billing account to your project.
   - Google Maps Platform has a monthly free tier; you will only be charged if usage exceeds it.
4. Enable the required APIs:
   - Open the navigation menu → **APIs & Services** → **Library**.
   - Search for and enable **Map Tiles API**.
   - Search for and enable **Maps JavaScript API**.
5. Create an API key:
   - Go to **APIs & Services** → **Credentials**.
   - Click **Create credentials** → **API key**.
   - Optional but recommended: click the key and restrict it:
     - Under **Application restrictions**, add your dev/prod domains (e.g., `localhost:5173/*` for local development).
     - Under **API restrictions**, select only the APIs you enabled (**Map Tiles API** and **Maps JavaScript API**).
6. Copy the key and paste it into `client/config.json` as `googleApiKey`.

### 2. Cesium ion access token

Required for Cesium to fetch terrain, imagery, and 3D tile endpoints.

#### Step-by-step

1. Go to Cesium ion: https://ion.cesium.com/
2. Sign up for a free account or log in.
3. Open **Access Tokens** from the top menu.
4. Click **Create token**.
   - Give it a name (e.g., `drone-navigation`).
   - Leave the default scopes or restrict them as needed.
5. Copy the generated token and paste it into `client/config.json` as `cesiumIonToken`.

### Final config file

Create `client/config.json` from the example:

```bash
cp client/config.example.json client/config.json
```

Then edit it:

```json
{
  "googleApiKey": "YOUR_GOOGLE_MAPS_API_KEY",
  "cesiumIonToken": "YOUR_CESIUM_ION_ACCESS_TOKEN"
}
```

Do not commit this file; it is already excluded by `.gitignore`.

## Running the app

```bash
cd client/3d_aerial
npm install
npm run dev
```

Open http://localhost:5173.

Click the **2D Map** button in the left sidebar to switch to a 2D Google Map centered on the drone. Click the **3D View** (drone) button to return to the photorealistic 3D view.

### Adding more Google APIs later

If a new feature needs another Google Maps Platform API (for example Geocoding API, Places API, or Roads API), follow the same steps:

1. Open the navigation menu → **APIs & Services** → **Library**.
2. Search for the API by name.
3. Click **Enable**.
4. Go to **APIs & Services** → **Credentials**, click your API key, and add the new API under **API restrictions**.
5. Rebuild and restart the app.
