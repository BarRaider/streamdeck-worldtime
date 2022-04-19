function openLatLong() {
    if (websocket && (websocket.readyState === 1)) {
        const json = {
            'event': 'openUrl',
            'payload': {
                'url': 'https://latlong.net'
            }
        };
        websocket.send(JSON.stringify(json));
    }
}