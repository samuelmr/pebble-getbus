var ajax = require('ajax');
var Feature = require('platform/feature');
var Settings = require('settings');
var UI = require('ui');
var Vector2 = require('vector2');
var Vibe = require('ui/vibe');

var ALERT_BEFORE = 3; // vibrate and change colors 3 mins before departure
var MAX_DEPS = 10;
var MAX_STOPS = 10;
var R = 6371000; // m
var res = Feature.resolution();

var departureURI = "http://pubtrans.it/hsl/reittiopas/departure-api?max=" + MAX_DEPS;
var stopsURI = "http://pubtrans.it/hsl/api-proxy?limit=" + MAX_STOPS +
  "&request=stops_area&epsg_in=4326&epsg_out=4326&diameter=5000&center_coordinate=";
var locationOptions = { "timeout": 15000, "maximumAge": 1000, "enableHighAccuracy": true };
var hslBounds = [60.75, 25.19, 60.12, 24.17];

var stops = [];
var timeTables = {};
var watcher, alertTimeout, lateTimeout;
var linefield, depfield, timefield;

var errorItems = [{title: 'Ei tietoja', subtitle: 'Kokeile uudelleen...'}];
var helpId = 'help';
var randomLocation = false;

var favorites = Settings.data('favorites') || [];
var storedLocations = Settings.data('storedLocations') || {};
var stopLocations = storedLocations;

function toRad(number) {
  return number * Math.PI / 180;  
}

function toDeg(number) {
  return number * 180 / Math.PI;
}

var distfield = new UI.Text({
  position: new Vector2(0, 20),
  size: new Vector2(res.x, 20),
  font: 'GOTHIC_18',
  backgroundColor: 'black',
  color: 'white',
  text: '',
  textAlign: 'center',
  textOverflow: 'ellipsis'
});

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

var main = new UI.Menu({
  sections: [
    {title: 'Paikannetaan...'}
  ]
});
main.on('select', function(e) {
  timeTables = {};
  if (e.itemIndex === 0) {
    main.sections([
      {title: 'Paikannetaan...'}
    ]);
    menu.section(1, {title: 'Lähimmät', items: [] });
    navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);
    menu.items(1, []);
  }
  else {
    main.section(1, [
      {title: 'Haetaan pysäkit...'}
    ]);
    refreshStops(favorites);
    refreshStops(stops);
  }
});
main.show();

if (favorites.length > 0) {
  refreshStops(favorites);  
}

navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);

function locationError(error) {
  main.item(0, 0, {title: 'Virhe!', subtitle: 'Yritä uudelleen'});
  console.warn('location error (' + error.code + '): ' + error.message);
}

function locationSuccess(position) {
  var lat = position.coords.latitude;
  var lon = position.coords.longitude;
  var title = 'Paikannettu';
  if (lat > hslBounds[0] || lon > hslBounds[1] || lat < hslBounds[2] || lon < hslBounds[3]) {
    title = 'Arvottu paikka';
    lat = Math.random()/10 + 60.17;
    lon = Math.random()/5 + 24.8;
    randomLocation = true;
  }
  main.section(0, {title: title, items: [
    {
      title: Math.round(lat*10000)/10000 + ',' + Math.round(lon*10000)/10000,
      subtitle: 'Päivitä sijainti'
    }
  ]});
  main.item(0, 1, {title: 'Haetaan pysäkit...'});
  // console.log("Got location " + lat + ',' + lon);
  var href = stopsURI + lon + ',' + lat;
  console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    buildStopMenu,
    logError
  );
}

function logError(e) {
  main.item(0, 1, {title: 'Virhe!', subtitle: 'Yritä uudelleen'});
  console.warn("Error getting " + this.href + ": " + e);
}

function disthead(pos1, pos2) {
  var dist,head;
  if (randomLocation) {
    dist = Math.round(Math.random()*999);
    head = Math.round(Math.random()*360);
  }
  else {
    var dLat = toRad(pos2.latitude-pos1.latitude);
    var dLon = toRad(pos2.longitude-pos1.longitude);
    // return ({distance: dLat, heading: dLon}); 
    var l1 = toRad(pos1.latitude);
    var l2 = toRad(pos2.latitude);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(l1) * Math.cos(l2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    dist = Math.round(R * c);
    var y = Math.sin(dLon) * Math.cos(l2);
     var x = Math.cos(l1)*Math.sin(l2) -
            Math.sin(l1)*Math.cos(l2)*Math.cos(dLon);
    head = toDeg(Math.round(Math.atan2(y, x)));
  }
  return ({distance: dist, heading: head});
}

function buildStopMenu(response) {
  stops = [];
  if (!response || !response[0]) {
    return false;
  }
  resp: for (var i=0; i<response.length; i++) {
    if (!response[i]) {
      continue;
    }
    var id = response[i].code;
    for (var j=0; j<favorites.length; j++) {
      if (id == favorites[j].id) {
        continue resp;
      }
    }
    var coords = response[i].coords.split(',');
    if (!coords) {
      continue;
    }
    stopLocations[id] = {latitude: coords[1], longitude: coords[0]};
    var code = response[i].codeShort;
    var name = code + ' ' + response[i].name;
    var dist = response[i].dist;
    var addr = response[i].address;
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
    stops.push({id: id, addr: addr, dist: dist, title: name, subtitle: dist});
  }
  menu.items(1, stops);
  var myTitle = stops.length + ' pysäkkiä';
  var mySub = 'Päivitä aikataulut';
  main.item(0, 1, {title: myTitle, subtitle: mySub});
  menu.on('select', function(e) {
    var items = timeTables[e.item.id] || errorItems;
    var stopMenu = new UI.Menu({
      sections: [{
        title: e.item.title,
        items: items
      }],
    });
    stopMenu.on('select', function(se){
      if (watcher) {
        navigator.geolocation.clearWatch(watcher);     
      }
      var data = se.item.data;
      if (!data) {
        return false;
      }
      var bgNow = 'white';
      var deptime = data.rtime || data.time;
      var d = new Date(deptime * 1000);
      var now = new Date();
      var lateTime = (d - now);
      var alertTime = lateTime - (ALERT_BEFORE * 60 * 1000);
      if (alertTime < 0) {
        bgNow = 'yellow';
      }
      else {
        alertTimeout = setTimeout(triggerAlert, alertTime);
      }
      if (lateTime < 0) {
        bgNow = 'red';
      }
      else {
        lateTimeout = setTimeout(triggerLate, lateTime);  
      }
      var h = d.getHours();
      // hours with leading zeros because TimeText %X has them
      h = (h < 10) ? "0" + h.toString() + "" : h;
      var m = d.getMinutes();
      m = (m < 10) ? "0" + m.toString() + "" : m;
      var s = d.getSeconds();
      s = (s < 10) ? "0" + s.toString() + "" : s;
      var wind = new UI.Window({fullscreen: true});
      distfield.text(e.item.addr);
      wind.add(distfield);
      if (stopLocations[data.stop]) {
        watcher = navigator.geolocation.watchPosition(function(pos) {
          if (stopLocations && stopLocations[data.stop]) {
            var dh = disthead(pos.coords, stopLocations[data.stop]);
            var head = 'pohjoiseen';
            dh.heading = (dh.heading < 0) ? 360 + dh.heading : dh.heading;
            if (dh.heading < 22.5){
              head = 'pohjoiseen';
            }
            else if (dh.heading < 67.5){
              head = 'koilliseen';
            }
            else if (dh.heading < 112.5){
              head = 'itään';
            }
            else if (dh.heading < 157.5){
              head = 'kaakkoon';
            }
            else if (dh.heading < 202.5){
              head = 'etelään';
            }
            else if (dh.heading < 247.5){
              head = 'lounaaseen';
            }
            else if (dh.heading < 292.5){
              head = 'länteen';
            }
            else if (dh.heading < 337.5){
              head = 'luoteeseen';
            }
            distfield.text(Math.round(dh.distance) + ' m ' + head);
          }
        });
      }
      var stopfield = new UI.Text({
        position: new Vector2(0, 40),
        size: new Vector2(res.x, 15),
        font: 'GOTHIC_14_BOLD',
        backgroundColor: 'black',
        color: 'white',
        text: data.stopname,
        textAlign: 'center',
        textOverflow: 'ellipsis'
      });
      wind.add(stopfield);
      linefield = new UI.Text({
        position: new Vector2(0, 60),
        size: new Vector2(res.x, 30),
        font: 'GOTHIC_24',
        backgroundColor: bgNow,
        color: 'black',
        text: data.line + ' ' + data.dest,
        textAlign: 'center',
        textOverflow: 'ellipsis'
      });
      wind.add(linefield);
      depfield = new UI.Text({
        position: new Vector2(0, 90),
        size: new Vector2(res.x, 30),
        font: 'BITHAM_30_BLACK',
        backgroundColor: bgNow,
        color: 'black',
        text: [h, m, s].join(":"),
        textAlign: Feature.round('center', 'left'),
        textOverflow: 'ellipsis'
      });
      wind.add(depfield);
      timefield = new UI.TimeText({
        position: new Vector2(0, 120),
        size: new Vector2(res.x, res.y-120),
        font: 'BITHAM_30_BLACK',
        backgroundColor: bgNow,
        color: 'black',
        text: '%X',
        textAlign: Feature.round('center', 'left'),
        textOverflow: 'ellipsis'
      });
      wind.add(timefield);
      wind.show();
      wind.on('hide', function() {
        if (alertTimeout) {
          clearTimeout(alertTimeout);
        }
        if (lateTimeout) {
          clearTimeout(lateTimeout);
        }
        if (watcher) {
          navigator.geolocation.clearWatch(watcher);
        }
      });
    });
    stopMenu.show();
  });
  menu.on('longSelect', function(e) {
    if (e.sectionIndex > 0) {
      if (e.item.id) {
        // console.log('Adding ' + e.item.id + ' to favorites.');
        favorites.push(e.item);
        storedLocations[e.item.id] = stopLocations[e.item.id];
        menu.items(e.sectionIndex).splice(e.itemIndex, 1);
      }
    }
    else {
      // console.log('Removing ' + e.item.id + ' from favorites.');
      e.item.subtitle = e.item.dist;
      menu.items(1).push(e.item);
      favorites.splice(e.itemIndex, 1);
      storedLocations[e.item.id] = null;
    }
    menu.items(0, favorites);
    for (var f in favorites) {
      favorites[f].subtitle = favorites[f].addr;
    }
    Settings.data('favorites', favorites);
    Settings.data('storedLocations', storedLocations);
  });
  if (menu.items(0).length < 1) {
    menu.items(0, [{id: helpId, title: 'Ei suosikkeja', subtitle: 'Ks. lisätietoja...'}]);
  }
  menu.show();
  refreshStops(stops);
}
function triggerAlert() {
  Vibe.vibrate('long');
  linefield.backgroundColor('yellow');
  depfield.backgroundColor('yellow');
  timefield.backgroundColor('yellow');    
}
function triggerLate() {
  Vibe.vibrate('double');
  linefield.backgroundColor('red');
  depfield.backgroundColor('red');
  timefield.backgroundColor('red');    
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
  console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    function(deps) {
      // console.log("OK, got " + deps.length + " departures");
      if (deps.length) {
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
                                   subtitle: dep.dest, data: dep});
        }
        for (var sect=0; sect<=1; sect++) {
          for (var it in menu.items(sect)) {
            var current = menu.item(sect, it);
            // console.log('Found item' + current.title);
            if (!current.id || !timeTables[current.id] || (current.id == helpId)) {
              continue;
            }
            var magicSub = (sect == 1) ? current.dist + '   ' : '';
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
