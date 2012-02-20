// $Revision: 1.3 $

var CBrowse = {};

CBrowse.Canvas = Base.extend({
  defaults: {
    urlParamTemplate : 'r=CHR:START-END', // Overwrite this for your URL style
    width            : 1000,
    height           : 200,
    labelWidth       : 134,
    buffer           : 1,
    longestLabel     : 30,
    tracks           : [],
    data             : { start: 9e99, end: -9e99 },
    colors           : {
      foreground: '#000000',
      background: '#FFFFFF'
    }
  },

  constructor: function (config) {
    var cBrowse = this;
    
    $.extend(this, this.defaults, config);
    
    if (!(this.container && this.container.length)) {
      this.die('You must supply a ' + (this.container ? 'valid ' : '') + 'container element');
    }
    
    this.init();
  },

  init: function () {
    var cBrowse = this;
    
    this.paramRegex     = new RegExp('([?&;])' + this.urlParamTemplate.replace(/^(\w+)=/, '($1)=').replace(/CHR(.)/, '(\\w+)($1)').replace(/START(.)/, '(\\d+)($1)').replace('END', '(\\d+)') + '([;&])');
    this.fullWidth      = this.width * (2 * this.buffer + 1);
    this.labelContainer = $('<div class="label_container">').width(this.labelWidth).appendTo(this.container);
    this.menuContainer  = $('<div class="menu_container">').css({ width: this.width - this.labelWidth - 1, left: this.labelWidth + 1 }).appendTo(this.container);
    
    this.container.width(this.width).on({
      mousedown: function (e) { 
        cBrowse.mousedown(e);
        return false;
      },
      dblclick: function (e) {
        var x = e.pageX - cBrowse.container.offset().left;
        cBrowse.zoomIn(x);
        return false;
      }
    }, '.image_container img');
    
    $(document).on('mousemove mouseup', function (e) {
      if (cBrowse.dragging) {
        cBrowse[e.type](e);
      }
    });
    
    /*window.onpopstate = function (e) {
      if (e.state !== null) {
        cBrowse.popState(e.state);
      }
    };*/
    
    var coords = (window.location.search + '&').match(this.paramRegex);
    
    this.setRange(coords[5], coords[7], false);
    this.setTracks();
    this.makeImage();
  },
  
  mousedown: function (e) {
    this.dragging   = true;
    this.dragOffset = e.pageX - this.delta;
    this.dragStart  = this.start;
  },
  
  mouseup: function (e, update) {
    var delta = this.delta;
    
    this.dragging = false;
    this.delta    = e.pageX - this.dragOffset;
    
    if (delta !== this.delta && update !== false) {
      this.updateURL();
    }
  },
  
  // FIXME: can scroll off the ends
  mousemove: function (e) {
    var left  = e.pageX - this.dragOffset;
    var start = this.dragStart - (left - this.delta) / this.scale;
    var end   = start + this.length
    this.left = left;
    
    $('.track_container', this.container).css('left', this.left);
    
    this.setRange(start, end, false);
    
    if (this.redraw()) {
      this.mouseup(e, false);
      this.mousedown(e);
    }
  },
  
  zoomIn: function (x) {
    if (!x) {
      x = this.width / 2;
    }
    
    var start = this.start + x / (2 * this.scale);
    var end   = start + this.length / 2;
    
    this.setRange(start, end);
  },
  
  zoomOut: function (x) {
    if (!x) {
      x = this.width / 2;
    }
    
    var start = this.start - x / this.scale;
    var end   = start + 2 * this.length;

    if (start < 1) {
      start = 1;
    }
    
    if (end > this.chromosome.size) {
      end = this.chromosome.size;
    }

    this.setRange(start, end);
  },
  
  // TODO: zooming
  redraw: function () {
    if (this.start >= this.edges.start && this.end <= this.edges.end) {
      return false;
    }
    
    this.makeImage();
    
    return true;
  },
  
  setRange: function (start, end, update, edges) {
    this.prevStart = this.start;
    this.prevEnd   = this.end;
    this.start     = parseInt(start, 10);
    this.end       = parseInt(end,   10);
    
    if (this.start < 1) {
      this.start = 1;
    }
    
    if (this.end > this.chromosome.size) {
      this.end = this.chromosome.size;
    }
    
    this.length = (this.end - this.start) || 1; // TODO: check when start = end
    this.zoom   = this.chromosome.size / this.length;
    
    this.setScale(edges);
    
    if (update !== false && (this.prevStart !== this.start || this.prevEnd !== this.end)) {
      this.updateURL();
    }
  },
  
  setScale: function (edges) {
    this.prevScale   = this.scale;
    this.scale       = this.zoom  * this.width / this.chromosome.size;
    this.scaledStart = this.start * this.scale;
    
    if (!this.end && this.zoom === 1) {
      this.end = this.chromosome.size;
    }
    
    if (this.prevScale !== this.scale) {
      this.edges = edges || { start: 9e99, end: -9e99 };
      this.left  = 0;
      this.delta = 0;
      
      if (this.prevScale) {
        this.menuContainer.children().hide();
        
        var i = this.tracks.length;
        
        while (i--) {
          this.tracks[i].setScale(!!edges);
        }
      }
    }
  },
  
  setTracks: function () {
    var defaults = {
      cBrowse         : this,
      canvasContainer : $('<div class="wrapper">').appendTo(this.container),
      paramRegex      : this.paramRegex,
      width           : this.width
    };
    
    for (var i = 0; i < this.tracks.length; i++) {
      this.tracks[i] = new CBrowse.Track[this.tracks[i].type]($.extend(this.tracks[i], defaults));
      
      if (this.tracks[i].name) {
        this.tracks[i].label = $('<div>', { html: this.tracks[i].name, css: { marginTop: i && !this.tracks[i-1].label ? this.tracks[i-1].height : 0, height: this.tracks[i].height } }).appendTo(this.labelContainer);
      }
    }
  },
  
  makeImage: function () {
    var cBrowse = this;
    var left    = -this.left;
    var start, end;
    
    if (left) {
      start = left > 0 ? this.edges.end   + 1 : this.edges.start - (this.buffer * this.length) - 1;
      end   = left < 0 ? this.edges.start - 1 : this.edges.end   + (this.buffer * this.length) + 1;
    } else {
      start = this.start - this.length;
      end   = this.end   + this.length;
    }
    
    this.edges.start = Math.min(start, this.edges.start);
    this.edges.end   = Math.max(end,   this.edges.end);
    
    var width = Math.round((end - start) * this.scale);
    
    /*if (!this.dragging) {
      this.setHistory(true);
    }*/
    
    $.when.apply($, $.map(this.tracks, function (track) { return track.makeImage(start, end, width, left); })).done(function () {
      $($.map(arguments, function (a) { return a.target; })).show().parent().addClass('loc_' + cBrowse.zoom.toString().replace('.', '_'));
      
      cBrowse.data.start = Math.min(start, cBrowse.data.start);
      cBrowse.data.end   = Math.max(end,   cBrowse.data.end);
      
      /*for (var i = 0; i < cBrowse.tracks.length; i++) {
        if (cBrowse.tracks[i].height < cBrowse.tracks[i].fullHeight) {
          cBrowse.tracks[i].sizeHandle.show();
        }
      }*/
    });
  },
  
  updateURL: function (redraw) {
    //this.setHistory();
    
    if (redraw !== false) {
      this.redraw();
    }
  },
  
  /*setHistory: function (replace) {
    window.history[replace ? 'replaceState' : 'pushState']({
      show  : 'loc_' + this.zoom.toString().replace('.', '_'),
      edges : this.edges
    }, '', this.getQueryString());
  },
  
  popState: function (state) {
    var coords = (window.location.search + '&').match(this.paramRegex);
    
    if (coords.length) {
      this.setRange(coords[5], coords[7], false, state.edges);
      var left   = parseInt($('.track_container:first', this.container).css('left'), 10) - Math.round((this.start - this.prevStart) * this.scale);
      var images = $('.track_container', this.container).css('left', left).children();
      var show   = images.filter('.' + state.show);
      
      if (this.edges.start <= state.edges.start && this.edges.end >= state.edges.end && show.length) {
        images.hide();
        show.show();
      } else {
        var callback;
        
        if (this.scale === this.prevScale) {
          this.left = left;
        }
        
        if (Math.abs(left) > this.width * (this.buffer + 1)) {
          callback = this.makeImage;
        }
        
        this.makeImage(callback);
      }
      
      this.delta = left;
    }
  },*/
  
  getQueryString: function () {
    return (window.location.search + '&').replace(this.paramRegex, '$1$2=$3$4' + this.start + '$6' + this.end + '$8').slice(0, -1);
  },
  
  decorateTrack : $.noop, // implement in plugin
  makeMenu      : $.noop  // implement in plugin
});
