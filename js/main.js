// Funzione per mostrare l'overlay con i dettagli dell'albero
function openTreeOverlay(feature) {
  document.getElementById('treeContent').scrollTop = 0;
  const treeDetails = document.getElementById('treeDetails');
  treeDetails.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = feature.properties.Nome;
  treeDetails.appendChild(title);

  const description = document.createElement('p');
  description.innerHTML = '<b>Nome Scientifico:</b> ' + feature.properties.Descrizione;
  treeDetails.appendChild(description);

  // 🌳 MODIFICA: La variabile 'history' è stata rinominata in 'treeHistory' per evitare di sovrascrivere l'oggetto globale 'history'.
  const treeHistory = document.createElement('p');
  treeHistory.innerHTML = feature.properties.Storia || '';
  treeDetails.appendChild(treeHistory);

  const imageContainer = document.createElement('div');
  imageContainer.id = 'treeImageContainer';

  if (feature.properties.image && feature.properties.image.length > 0) {
    feature.properties.image.forEach(imgUrl => {
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = feature.properties.Nome;
      imageContainer.appendChild(img);
    });
  }

  treeDetails.appendChild(imageContainer);
  document.getElementById('treeOverlay').classList.add('visible');
  // 🌳 Il metodo 'history.pushState' ora farà riferimento all'oggetto globale 'window.history'.
  window.history.replaceState(null, '', location.pathname + '#overlay'); 
}

// Funzione per chiudere l'overlay
function closeOverlay() {
  document.getElementById('treeOverlay').classList.remove('visible');
  unhighlightLayers();
}

function openInfoOverlay() {
  // Pulisce l'hash esistente o usa replaceState per non aggiungere #info al di sopra di #overlay
  if (location.hash.includes('#overlay') || location.hash.includes('#info') || location.hash.includes('#menu-open') || location.hash.includes('#popup')) {
      window.history.replaceState(null, '', location.pathname + '#info');
  } else {
      // Usa pushState se non c'è già un overlay aperto per consentire il tasto Indietro
      window.history.pushState(null, '', location.pathname + '#info');
  }
  
  // Chiudi qualsiasi altra interfaccia aperta
  closeMenu();
  document.getElementById('treeOverlay').classList.remove('visible');
  map.closePopup();
  unhighlightLayers(); 
  
  document.getElementById('infoOverlay').classList.add('visible');
  document.getElementById('infoContent').scrollTop = 0;
}

// Funzione per chiudere l'overlay Info
function closeInfoOverlay() {
  document.getElementById('infoOverlay').classList.remove('visible');
}

// 🌳 Funzione per chiudere il menu
function closeMenu() {
    const treeListMenu = document.getElementById('treeListMenu');
    treeListMenu.style.transform = 'translateX(100%)';
}

// 🌳 Funzione per aprire il menu
function openMenu() {
  closeInfoOverlay();
  document.getElementById('treeOverlay').classList.remove('visible');
  map.closePopup();
  unhighlightLayers();

  const treeListMenu = document.getElementById('treeListMenu');
  treeListMenu.style.transform = 'translateX(0)';
  // 🌳 Aggiunto: Quando il menu è aperto, aggiungi uno stato alla cronologia del browser.
  if (location.hash) {
      window.history.replaceState(null, '', location.pathname);
  }
  
  // 🌳 Aggiunto: Quando il menu è aperto, aggiungi uno stato alla cronologia del browser.
  window.history.pushState({ menuOpen: true }, '', '#menu-open');
}

// Aggiunto per gestire l'evidenziazione dei marker
let highlightedLayers = [];
const HIGHLIGHT_COLOR = '#ffcc00'; // Colore Giallo/Arancio per evidenziare

function unhighlightLayers() {
  // Colore originale del cerchio: "#238210" (Verde Scuro)
  highlightedLayers.forEach(layer => {
    layer.setStyle({
        fillColor: "#238210",
        color: "", // Rimuove il bordo (o imposta il colore originale)
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7,
    });
  });
  highlightedLayers = [];
}

let map;

let watchId = null;
let gpsMarker = null;
let accuracyCircle = null;
let isInitialCenter = false;

// Caricamento dinamico dei POIs da pois.json
window.onload = function() {
  fetch('data/pois.json')
    .then(response => response.json())
    .then(geojsonPois => {
      initMap(geojsonPois);
    })
    .catch(err => console.error("Errore nel caricamento di pois.json:", err));
};

// Funzione che inizializza la mappa
function initMap(geojsonPois) {
  const parkBounds = L.latLngBounds([[45.228, 11.654], [45.232, 11.660]]);

    map = L.map('map', {
    minZoom: 17,
    maxZoom: 20,
    maxBounds: parkBounds,
    maxBoundsViscosity: 1.0
  }).setView([45.2286, 11.6574], 17);

   // Add a new pane for the OpenStreetMap layer
  map.createPane('osmPane');
  map.getPane('osmPane').style.zIndex = 600;

  // Add the OpenStreetMap tile layer to the new pane
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    pane: 'osmPane',
    noWrap: true
  }).addTo(map);

  // Create a new pane for the SVG overlay
  map.createPane('svgPane');
  map.getPane('svgPane').style.zIndex = 601;

  const imageUrl = 'images/Satellite_2.png';
  const imageBounds = [[45.22854, 11.65642], [45.230548, 11.65925]];
  L.imageOverlay(imageUrl, imageBounds, { opacity: 1, interactive: true, pane: 'svgPane' }).addTo(map);

  map.createPane('circlePane');
  map.getPane('circlePane').style.zIndex = 602;

  const markers = L.markerClusterGroup({
    animateAddingMarkers: true,
    disableClusteringAtZoom: 17,
    spiderfyOnMaxZoom: false
  });

  function updateCircleSizes() {
    const currentZoom = map.getZoom();
    const zoomDifference = currentZoom - 18;
    markers.eachLayer(function(layer) {
      if (layer.options.radiusAtZoom18) {
        const newRadius = layer.options.radiusAtZoom18 * Math.pow(2, zoomDifference);
        layer.setRadius(newRadius);
      }
    });
  }

  const parkFeature = geojsonPois.features.find(f => f.geometry.type === "Polygon");
  const pointFeatures = geojsonPois.features.filter(f => f.geometry.type === "Point");

  if (parkFeature) {
    const parkCoordinates = parkFeature.geometry.coordinates[0];
    const outerBounds = [[90, -180], [90, 180], [-90, 180], [-90, -180]];

    L.polygon([outerBounds, parkCoordinates], {
      fillColor: '#cecece',
      fillOpacity: 0,
      stroke: false
    }).addTo(map);

    L.geoJSON(parkFeature, {
      style: {
        fillColor: '#3c9629',
        weight: 2,
        opacity: 0,
        color: '#255c19',
        dashArray: '3',
        fillOpacity: 0.0
      }
    }).addTo(map);
  }

  map.on('click', () => closeMenu());

  const menuButton = document.getElementById('menuButton');
  const treeListMenu = document.getElementById('treeListMenu');
  const treeList = document.getElementById('treeList');
  const treeOverlay = document.getElementById('treeOverlay');
  const infoButton = document.getElementById('infoButton');
  const infoOverlay = document.getElementById('infoOverlay');

  infoButton.onclick = openInfoOverlay;

  infoOverlay.addEventListener('click', e => {
    if (e.target === infoOverlay) closeInfoOverlay();
  });
  
  menuButton.onclick = () => {
    if (treeListMenu.style.transform === 'translateX(0px)') {
      closeMenu();
    } else {
      openMenu();
    }
  };

  treeOverlay.addEventListener('click', e => {
    if (e.target === treeOverlay) closeOverlay();
  });

// --- NUOVA LOGICA: Raggruppamento per Specie Uniche ---

  // 1. Raggruppa i feature per Nome (Specie)
  const speciesMap = new Map();
  pointFeatures.forEach(feature => {
    const speciesName = feature.properties.Nome;
    if (!speciesMap.has(speciesName)) {
      speciesMap.set(speciesName, []);
    }
    speciesMap.get(speciesName).push(feature);
  });

  // 2. Ordina i nomi delle specie uniche
  const uniqueSpeciesNames = Array.from(speciesMap.keys()).sort((a, b) => 
    a.localeCompare(b, 'it', { sensitivity: 'base' })
  );

  // 3. Popola il menù laterale con i nomi delle specie uniche
  treeList.innerHTML = ''; // Pulisce la lista esistente

  uniqueSpeciesNames.forEach(speciesName => {
    const featuresOfSpecies = speciesMap.get(speciesName);
    
    const li = document.createElement('li');
    li.textContent = speciesName;
    
    // 🌳 Collega l'evento di click alla nuova funzione di gestione della selezione
    li.onclick = () => {
      handleSpeciesSelection(speciesName, featuresOfSpecies);
    };
    
    treeList.appendChild(li);
  });
  
  // --- FINE NUOVA LOGICA: Raggruppamento per Specie Uniche ---

// Funzione per gestire la selezione della specie dal menù (AGGIORNATA)
  function handleSpeciesSelection(speciesName, featuresOfSpecies) {
    closeMenu();
    map.closePopup();
    unhighlightLayers(); // 1. Pulisce l'evidenziazione precedente

    // Seleziona il primo elemento del gruppo come target per la mappa
    const firstFeature = featuresOfSpecies[0]; 
    const latlng = [firstFeature.geometry.coordinates[1], firstFeature.geometry.coordinates[0]];
    
    // 2. Sposta la mappa sul primo elemento
    map.flyTo(latlng, 19); 

    // 3. Evidenzia tutti i marker della specie
    map.once('moveend', () => {
      markers.eachLayer(layer => {
        const isCircle = layer.options.pane === 'circlePane';
        
        // Controlla se le coordinate di questo layer appartengono a un albero della specie selezionata
        const featureMatch = featuresOfSpecies.find(f => {
            return L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]).equals(layer.getLatLng());
        });

        if (isCircle && featureMatch) {
            layer.setStyle({
                fillColor: HIGHLIGHT_COLOR,
                color: "",
                weight: 3,
            });
            highlightedLayers.push(layer);
            
            // Se si tratta di una specie con un solo albero, possiamo aprire il popup
            // per comodità, dato che non c'è scelta da fare.
            if (featuresOfSpecies.length === 1 && featureMatch.id === firstFeature.id) {
                 layer.openPopup();
                 history.replaceState(null, '', location.pathname + '#popup'); // Rimuovere/Modificare
                
                 setTimeout(() => {
                    const openButton = document.querySelector(`.open-details-button[data-feature-id="${firstFeature.id}"]`);
                    if (openButton) {
                        openButton.onclick = () => {
                            layer.closePopup();
                            unhighlightLayers(); // Rimuovi evidenziazione prima di aprire la scheda
                            openTreeOverlay(firstFeature); 
                        };
                    }
                }, 50);
            }
        }
      });
    });
  }

  pointFeatures.forEach(feature => {
    const latlng = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
    const radiusAtZoom18 = feature.properties.raggio || 8;
    const treeName = feature.properties.Nome;

    const popupContent = `
      <div class="tree-popup">
        <h3 class="popup-title">${treeName}</h3>
        <button class="open-details-button" data-feature-id="${feature.id}">
          Vedi Scheda Completa 🌳
        </button>
      </div>
    `;

    const treeCircle = L.circleMarker(latlng, {
      radius: radiusAtZoom18,
      fillColor: "#238210",
      color: "",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.7,
      pane: 'circlePane'
    });
    treeCircle.options.radiusAtZoom18 = radiusAtZoom18;

    treeCircle.bindPopup(popupContent, {
      closeButton: false,
      offset: L.point(0, -radiusAtZoom18 - 5) // Sposta il popup leggermente sopra il cerchio
    });
    
treeCircle.on('click', function() {
        closeMenu();
        closeInfoOverlay();
        unhighlightLayers(); // <-- Rimuovi evidenziazione precedente

        // Evidenzia solo il marker cliccato
        this.setStyle({
            fillColor: HIGHLIGHT_COLOR,
            color: "",
            weight: 3,
        });
        highlightedLayers.push(this); // Aggiungi questo marker alla lista degli evidenziati
        
        this.openPopup();
        history.replaceState(null, '', location.pathname + '#popup');

        setTimeout(() => {
            const openButton = document.querySelector(`.open-details-button[data-feature-id="${feature.id}"]`);
            if (openButton) {
                openButton.onclick = () => {
                    this.closePopup();
                    unhighlightLayers(); // <-- Rimuovi evidenziazione prima di aprire la scheda
                    openTreeOverlay(feature); 
                };
            }
        }, 50); 
    });
    
    markers.addLayer(treeCircle);
  });

  map.on('zoomend', updateCircleSizes);
  map.addLayer(markers);
  updateCircleSizes();

  // AGGIUNTA PER LA COERENZA DELLA CRONOLOGIA DEL POPUP
  map.on('popupclose', function(e) {
    // Rimuove #popup dall'URL quando Leaflet chiude il popup
    if (location.hash.includes('#popup')) {
      window.history.replaceState(null, '', location.pathname);
    }
    // NOTA: unhighlightLayers() non è necessario qui, perché viene gestito dal click successivo
    // (es. apertura scheda) o dalla chiusura generale con onpopstate.
  });
// --- Funzioni e Gestori di Eventi per la Geolocalizzazione GPS ---
  
  // 2. Gestisce il successo della localizzazione
  function onLocationFound(e) {
    const radius = e.accuracy / 2; // Raggio di accuratezza

    // Rimuovi eventuali marker GPS precedenti per evitare duplicati
    map.eachLayer(function(layer) {
        if (layer.options && layer.options.isGpsMarker) {
            map.removeLayer(layer);
        }
    });

    // Marker della posizione corrente (un cerchio)
    L.marker(e.latlng, { isGpsMarker: true }).addTo(map)
      .bindPopup("Sei qui, con una precisione di " + radius.toFixed(0) + " metri.").openPopup();

    // Cerchio di accuratezza
    L.circle(e.latlng, radius, {
        color: '#007bff', 
        fillColor: '#007bff',
        fillOpacity: 0.2,
        weight: 1,
        isGpsMarker: true // Identifica il layer come marker GPS
    }).addTo(map);
  }

  // 3. Gestisce l'errore di localizzazione (es. utente nega il permesso)
  function onLocationError(e) {
    console.error("Errore di geolocalizzazione:", e.message);
    // Opzionale: Mostra un messaggio all'utente in caso di errore
    alert("Impossibile trovare la tua posizione. Assicurati che il GPS sia attivo e che tu abbia concesso il permesso.");
  }

  // Collega i gestori di eventi alla mappa
  map.on('locationfound', onLocationFound);
  map.on('locationerror', onLocationError);
  
  // -------------------------------------------------------------------
}

// --- Gestione della Cronologia (Tasto 'Indietro') CORRETTA e COMPLETA ---
window.onpopstate = () => {
    const isTreeOverlayVisible = document.getElementById('treeOverlay').classList.contains('visible');
    const isInfoOverlayVisible = document.getElementById('infoOverlay') ? document.getElementById('infoOverlay').classList.contains('visible') : false; // <-- AGGIUNTO IL CONTROLLO
    const isMenuOpen = document.getElementById('treeListMenu').style.transform === 'translateX(0px)';
    const isPopupOpen = map.getContainer().querySelector('.leaflet-popup-pane');
    
    // 0. GESTIONE MENU: Se il menu è aperto e l'hash è cambiato, chiudilo.
    if (isMenuOpen && location.hash !== '#menu-open') {
        closeMenu();
    }
    
    // 1. GESTIONE OVERLAY ALBERO: Controlla se l'overlay DEVE essere chiuso
    if (isTreeOverlayVisible && !location.hash.includes('#overlay')) {
        // Chiude l'overlay se la classe è attiva ma l'hash è sparito
        document.getElementById('treeOverlay').classList.remove('visible');
    }
    
    // 2. GESTIONE OVERLAY INFO: Controlla se l'overlay DEVE essere chiuso <-- AGGIUNTO
    if (isInfoOverlayVisible && !location.hash.includes('#info')) {
        document.getElementById('infoOverlay').classList.remove('visible');
    }
    
    // 3. GESTIONE POPUP: Controlla se un popup DEVE essere chiuso
    if (isPopupOpen && !location.hash.includes('#popup')) {
        map.closePopup();
    }
    
    // 4. GESTIONE PULIZIA: Rimuove l'evidenziazione e l'hash URL se non c'è più nulla aperto
    // Chiude il popup? Pulisci l'evidenziazione.
    if (!isPopupOpen && location.hash.includes('#popup')) {
        unhighlightLayers();
    }

    // Se la pagina è completamente pulita, assicurati che l'URL sia pulito.
    if (!isTreeOverlayVisible && !isInfoOverlayVisible && !isPopupOpen && !isMenuOpen) {
         unhighlightLayers(); // Pulizia finale
         // Pulisci l'hash URL se la pagina è "pulita"
         window.history.replaceState(null, '', location.pathname);
    }
};
// -----------------------------------------------------------------------

const gpsButton = document.getElementById('gpsButton');

const locationOptions = {
    enableHighAccuracy: true,
    timeout: 15000, // Aumenta il timeout per il watch
    maximumAge: 0,
};

// Funzione per ricentrare la mappa sul marker GPS esistente
function reCenterMap() {
    if (gpsMarker) {
        // Chiudi le interfacce aperte per focalizzarti sulla mappa
        closeMenu();
        closeOverlay();
        closeInfoOverlay();
        map.closePopup();

        // Ricentra la mappa sul marker GPS esistente
        map.flyTo(gpsMarker.getLatLng(), map.getZoom() > 18 ? map.getZoom() : 18, {
             duration: 1.5 // Animazione FlyTo
        });
        
        // Breve feedback visivo sul pulsante
        gpsButton.textContent = '◉ Centrato';
        setTimeout(() => {
            if (watchId !== null) {
                 gpsButton.textContent = '◉ GPS Attivo';
            }
        }, 800);
        
    } else if (watchId !== null) {
        alert('Attendi il primo fix di posizione.');
    }
}

function startTracking() {
    closeMenu();
    closeOverlay();
    closeInfoOverlay();
    unhighlightLayers();
    
    // 🌳 NUOVA LOGICA: Imposta il flag per centrare al primo fix di onLocationSuccess
    isInitialCenter = true; 
    
    // USA watchPosition PER IL TRACCIAMENTO CONTINUO
    watchId = navigator.geolocation.watchPosition(onLocationSuccess, onLocationError, locationOptions);
    
    // Cambia il testo e disabilita durante l'attesa del primo fix
    gpsButton.disabled = true;
    gpsButton.textContent = 'GPS...';
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    isInitialCenter = false; // <-- RESETTA IL FLAG

    // Rimuovi i layer dalla mappa
    if (gpsMarker) {
        map.removeLayer(gpsMarker);
        gpsMarker = null;
    }
    if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
    }
    
    // Resetta lo stato del pulsante
    gpsButton.disabled = false;
    gpsButton.textContent = '⚲';
    gpsButton.style.backgroundColor = '#007800cc'; // Torna al colore originale
}

// Gestore click per avviare/ricentrare/interrompere la localizzazione
if (gpsButton) {
    gpsButton.onclick = () => {
        if (watchId === null) {
            startTracking(); // Avvia il tracciamento
        } else {
            // Se il tracciamento è già attivo, ricentra la mappa
            reCenterMap(); 
        }
        
        // *OPZIONALE: Se vuoi tornare al vecchio comportamento Start/Stop, 
        // sostituisci il blocco 'else' qui sopra con 'stopTracking();'
    }
}

// 2. Gestisce il successo della localizzazione (AGGIORNATA PER TRACCIAMENTO E CENTRAGGIO)
  function onLocationSuccess(e) {
    const latlng = e.latlng;
    const radius = e.accuracy / 2;
    
    // Rimuovi i layer precedenti se esistono
    if (gpsMarker) {
        map.removeLayer(gpsMarker);
    }
    if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
    }

    // Cerchio di accuratezza
    accuracyCircle = L.circle(latlng, radius, {
        color: '#1a73e8', // Blu
        fillColor: '#1a73e8',
        fillOpacity: 0.15,
        weight: 1,
        isGpsMarker: true 
    }).addTo(map);

    // Marker della posizione corrente
    gpsMarker = L.circleMarker(latlng, {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#1a73e8',
        fillOpacity: 1,
        isGpsMarker: true 
    }).addTo(map)
      .bindPopup("Sei qui, precisione: " + radius.toFixed(0) + " metri.");
    
    // 🌳 NUOVA LOGICA: FlyTo solo al primo fix
    if (isInitialCenter) {
        // Usa fitBounds sull'accuratezza per una migliore visualizzazione iniziale
        const bounds = accuracyCircle.getBounds();
        map.fitBounds(bounds, { maxZoom: 18, padding: [50, 50] });
        
        // Resetta il flag dopo il primo centraggio
        isInitialCenter = false;
        
        // Aggiorna subito il pulsante dopo il primo fix (feedback visivo)
        gpsButton.disabled = false;
        gpsButton.textContent = '◉ GPS Attivo';
        gpsButton.style.backgroundColor = '#00aaff';
    }
  }

  // 3. Gestisce l'errore di localizzazione (AGGIORNATA)
  function onLocationError(e) {
    console.error("Errore di geolocalizzazione:", e.message);
    // Interrompi il tracciamento in caso di errore
    stopTracking(); 
    alert("Impossibile trovare la tua posizione. Assicurati che il GPS sia attivo e di aver concesso i permessi.");
  }
