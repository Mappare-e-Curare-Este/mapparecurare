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
  window.history.pushState(null, '', location.pathname + '#overlay'); 
}

// Funzione per chiudere l'overlay
function closeOverlay() {
  document.getElementById('treeOverlay').classList.remove('visible');
  unhighlightLayers();
}

// 🌳 Funzione per chiudere il menu
function closeMenu() {
    const treeListMenu = document.getElementById('treeListMenu');
    treeListMenu.style.transform = 'translateX(100%)';
}

// 🌳 Funzione per aprire il menu
function openMenu() {

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
                 history.pushState(null, '', location.pathname + '#popup'); // Rimuovere/Modificare
                
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
        unhighlightLayers(); // <-- Rimuovi evidenziazione precedente

        // Evidenzia solo il marker cliccato
        this.setStyle({
            fillColor: HIGHLIGHT_COLOR,
            color: "",
            weight: 3,
        });
        highlightedLayers.push(this); // Aggiungi questo marker alla lista degli evidenziati
        
        this.openPopup();
        history.pushState(null, '', location.pathname + '#popup');

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
    const isOverlayVisible = document.getElementById('treeOverlay').classList.contains('visible');
    const isMenuOpen = document.getElementById('treeListMenu').style.transform === 'translateX(0px)';
    const isPopupOpen = map.getContainer().querySelector('.leaflet-popup-pane');
    
    // 0. GESTIONE MENU: Se il menu è aperto e l'hash è cambiato, chiudilo.
    if (isMenuOpen && location.hash !== '#menu-open') {
        closeMenu();
    }
    
    // 1. GESTIONE OVERLAY: Controlla se l'overlay DEVE essere chiuso
    if (isOverlayVisible && !location.hash.includes('#overlay')) {
        // Chiude l'overlay se la classe è attiva ma l'hash è sparito
        document.getElementById('treeOverlay').classList.remove('visible');
    }
    
    // 2. GESTIONE POPUP: Controlla se un popup DEVE essere chiuso
    if (isPopupOpen && !location.hash.includes('#popup')) {
        map.closePopup();
    }
    
    // 3. GESTIONE PULIZIA: Rimuove l'evidenziazione e l'hash URL se non c'è più nulla aperto
    if (!isOverlayVisible && !isPopupOpen && !isMenuOpen) {
         unhighlightLayers();
         // ✅ AGGIUNTA: Pulisci l'hash URL se la pagina è "pulita"
         window.history.replaceState(null, '', location.pathname);
    }
};
// -----------------------------------------------------------------------

const gpsButton = document.getElementById('gpsButton');

// Gestore click per avviare la localizzazione
if (gpsButton) {
    gpsButton.onclick = () => {
        // Opzioni di localizzazione
        const locationOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
            setView: true, // Centra la mappa sulla posizione
            maxZoom: 17
        };
        
        // Avvia la localizzazione. Leaflet usa i gestori onLocationFound/Error definiti in initMap.
        map.locate(locationOptions); 
        
        // Disabilita il pulsante per evitare click multipli mentre cerca
        gpsButton.disabled = true;
        gpsButton.textContent = '...GPS...';
        
        // Riabilita il pulsante dopo 10 secondi (il timeout) o al successo/errore
        const resetGpsButton = () => {
             gpsButton.disabled = false;
             gpsButton.textContent = '⚲';
        };
        setTimeout(resetGpsButton, locationOptions.timeout);
        map.once('locationfound', resetGpsButton);
        map.once('locationerror', resetGpsButton);
    }

}
