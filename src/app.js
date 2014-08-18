var ajax = require('ajax');
var Settings = require('settings');
var UI = require('ui');
var Vector2 = require('vector2');

// var MAX_FAVORITES = 4;
var MAX_DEPS = 10;
var MAX_STOPS = 10;
var departureURI = "http://pubtrans.it/hsl/reittiopas/departure-api?max=" + MAX_DEPS;
var stopsURI = "http://pubtrans.it/hsl/stops?max=" + MAX_STOPS;
var locationOptions = { "timeout": 15000, "maximumAge": 1000, "enableHighAccuracy": true };
var timeTables = {};
var errorItems = [{title: 'Ei tietoja', subtitle: 'Kokeile uudelleen...'}];
var helpId = 'help';

var favorites = Settings.data('favorites') || [];
// console.log('Found favorites: ' + favorites);

var info = new UI.Card({
  title: 'Get Bus',
  // icon: 'images/menu_icon.png',
  subtitle: 'Lähipysäkkien tiedot',
  body: 'Paikannetaan...'
});
info.show();

var menu = new UI.Menu({
  sections: [
    {
      title: 'Suosikit',
      items: favorites
    },
    {
      title: 'Lähimmät',
      items: []
    }
  ]
});

if (favorites.length > 0) {
  refreshStops(favorites);  
}

navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);

function locationError(error) {
  info.title('Virhe');
  info.subtitle('');
  info.body('Paikannus ei onnistunut. Käynnistä sovellus uudelleen.');
  console.warn('location error (' + error.code + '): ' + error.message);
}

function locationSuccess(position) {
  var lat = position.coords.latitude;
  var lon = position.coords.longitude;
  info.title('Paikannettu');
  info.subtitle(Math.round(lat*100000)/100000 + '\n' + Math.round(lon*100000)/100000);
  info.body('Haetaan pysäkit...');
  // console.log("Got location " + lat + ',' + lon);
  var href = stopsURI + '&lat=' + lat + '&lon=' + lon;
  // console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    getStopLines,
    logError
  );
}

function logError(e) {
  info.title('Virhe');
  info.subtitle('');
  info.body('Tietojen lataus ei onnistunut.');
  console.warn("Error getting " + this.href + ": " + e);
}

function getStopLines(response) {
  var stops = [];
  if (!response || !response.features || !response.features[0]) {
    return false;
  }
  info.title('Valmista tuli');
  info.subtitle('');
  info.body('Löytyi ' + response.features.length + ' pysäkkiä...');
  resp: for (var i=0; i<response.features.length; i++) {
    if (!response.features[i]) {
      continue;
    }
    var id = response.features[i].properties.id;
    for (var j=0; j<favorites.length; j++) {
      if (id == favorites[j].id) {
        continue resp;
      }
    }
    var code = response.features[i].properties.code;
    var name = code + ' ' + utf8(response.features[i].properties.name);
    var dist = response.features[i].properties.dist;
    var addr = utf8(response.features[i].properties.addr);
    // console.log("got stop: " + id + ", name " + name + ", dist " + dist);
    if (!id || !name || !dist) {
      // console.log("Information missing, skipping stop...");
      continue;
    }
    if (dist > 999) {
      dist = Math.round(dist*10)/10000 + " km";
    }
    else {
      dist = dist + " m";
    }
    // stops.push({id: id, code: code, addr: addr, title: name, subtitle: dist});
    stops.push({id: id, addr: addr, title: name, subtitle: dist});
  }
  menu.items(1, stops);
  menu.on('select', function(e) {
    var items = timeTables[e.item.id] || errorItems;
    var stopMenu = new UI.Menu({
      sections: [{
        title: e.item.title,
        items: items
      }]
    });
    stopMenu.on('select', function(e){
      var data = e.item.data;
      if (!data) {
        return false;
      }
      var deptime = data.rtime || data.time;
      var d = new Date(deptime * 1000);
      var m = d.getMinutes();
      m = (m < 10) ? "0" + m.toString() + "" : m;
      var s = d.getSeconds();
      s = (s < 10) ? "0" + s.toString() + "" : s;
      var wind = new UI.Window({fullscreen: true});
      var stopfield = new UI.Text({
        position: new Vector2(0, 0),
        size: new Vector2(144, 30),
        font: 'GOTHIC_24_BOLD',
        text: utf8(data.stopname),
        textAlign: 'center'
      });
      wind.add(stopfield);
      var linefield = new UI.Text({
        position: new Vector2(0, 40),
        size: new Vector2(144, 30),
        font: 'GOTHIC_24',
        text: data.line + ' ' + utf8(data.dest),
        textAlign: 'center'
      });
      wind.add(linefield);
      var depfield = new UI.Text({
        position: new Vector2(0, 80),
        size: new Vector2(144, 30),
        font: 'BITHAM_30_BLACK',
        text: [d.getHours(), m, s].join(":"),
        textAlign: 'center'
      });
      wind.add(depfield);
      var timefield = new UI.TimeText({
        position: new Vector2(0, 120),
        size: new Vector2(144, 30),
        font: 'BITHAM_30_BLACK',
        text: '%H:%M:%S',
        textAlign: 'center'
      });
      wind.add(timefield);   
      wind.show();
    });
    stopMenu.show();
  });
  menu.on('longSelect', function(e) {
    if (e.sectionIndex > 0) {
      // console.log('Adding ' + e.item.id + ' to favorites.');
      favorites.push(e.item);
      menu.items(e.sectionIndex).splice(e.itemIndex, 1);
    }
    else {
      // console.log('Removing ' + e.item.id + ' from favorites.');
      menu.items(1).push(e.item);
      favorites.splice(e.itemIndex, 1);
    }
    menu.items(0, favorites);
    for (var f in favorites) {
      favorites[f].subtitle = favorites[f].addr;
    }
    Settings.data('favorites', favorites);
  });
  if (menu.items(0).length < 1) {
    menu.items(0, [{id: helpId, title: 'Ei suosikkeja', subtitle: 'Ks. lisätietoja...'}]);
  }
  menu.show();
  info.hide();
  refreshStops(stops);
}

function refreshStops(stops) {
  if (stops.length <= 0) {
    // console.log("stops.length = " + stops.length);
    return false;
  }
  var href = departureURI;
  for (var i=0; i<stops.length; i++) {
    href += "&stops%5B%5D=" + stops[i].id;
  }
  // console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    function(deps) {
      // console.log("OK, got " + deps.length + " departures");
      if (deps.length) {
        timeTables = {};
        timeTables[helpId] = [{title: 'Lisää suosikki', subtitle: 'pitkään painamalla'}];
        for (var j=0; j<deps.length; j++) {
          var dep = deps[j];
          var stopId = dep.stop;
          if (!timeTables[stopId]) {
            timeTables[stopId] = [];
          }
          var time = dep.rtime || dep.time;
          var d = new Date(time * 1000);
          var m = d.getMinutes();
          m = (m < 10) ? "0" + m.toString() + "" : m;
          timeTables[stopId].push({title: dep.line + ' @ ' + [d.getHours(), m].join(":"),
                                   subtitle: utf8(dep.dest), data: dep});
        }
        for (var sect=0; sect<=1; sect++) {
          for (var it in menu.items(sect)) {
            var current = menu.item(sect, it);
            // console.log('Found item' + current.title);
            if (!current.id || !timeTables[current.id] || (current.id == helpId)) {
              continue;
            }
            var magicSub = (sect == 1) ? current.subtitle + '   ' : '';
            var nextDeps = [];
            for (var n=0; n<(2-sect); n++) {
              nextDeps.push(timeTables[current.id][n].title);
            }
            magicSub += nextDeps.join(', ');
            var newItem = {id: current.id, title: current.title,
                           subtitle: magicSub};
            menu.item(sect, it, newItem);
          }
        }
      }
    },
    logError
  );
  menu.show();
}

function utf8(str) {
  return unescape(encodeURI(str));
}
