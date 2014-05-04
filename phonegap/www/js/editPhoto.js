//TODO:what does this method mean?
if (!Function.prototype.bind) {
  Function.prototype.bind = function (oThis) {
    if (typeof this !== "function") {
      // closest thing possible to the ECMAScript 5 internal IsCallable function
      throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
    }

    var aArgs = Array.prototype.slice.call(arguments, 1), 
    fToBind = this, 
    fNOP = function () {},
    fBound = function () {
      return fToBind.apply(this instanceof fNOP
                           ? this
                           : oThis || window,
                           aArgs.concat(Array.prototype.slice.call(arguments)));
    };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}

//The Global NameSpace
App = {};

;(function(App, $, undefined){

  if (typeof App == 'undefined') window.App = {};

  // the numbers of groups contained in the baselayer  
  var count = 0;

  // stage > baseLayer > eBg 
  //                    > bgGroup > photo [                                        
  //                                        the editable bgGroup
  //                    > bgGroup > deco     means the "eEdit"
  //                    > bgGroup > deco  ]  
  //                   > eHandle
  var _setStage = function() {
    var self = App.EditPhoto;
    if (!self.stage) {
      self.stage = new Kinetic.Stage({
        container: self.options.canvasContainer,
        width: self.options.stageWidth,
        height: self.options.stageHeight
      });
    }
  };

  var _setBaseLayer = function() {
    var self = App.EditPhoto;
    if (!self.baseLayer) {
      self.baseLayer = new Kinetic.Layer(
        //TODO:OPTIMISE
        {hitGrapeEnabled: false} 
      );
      self.eBg = new Kinetic.Rect({
        x:0,
        y:0,
        width: self.options.stageWidth,
        height: self.options.stageHeight,
        fill: self.options.stageBgColor,
        id: 'bg',
        //TODO:OPTIMISE
        transformsEnabled: 'position'
      });
      self.eBg.on('touchend', _.throttle(function(e){
        console.log('eBg,touchend');
        if (self.eEdit) {
          if (self.eEdit.isPinching) return;
        }
        self.changeToPreviewMode();
        _render();
      },300));
      self.baseLayer.add(self.eBg);
      self.stage.add(self.baseLayer);
    }
  };

  var _createHandle = function() {
    var self = App.EditPhoto;
    if (!self.eHandle) {
      var imageObj = new Image();
      imageObj.src = self.options.handleImagePath;
      imageObj.onload = function() {
        self.eHandle.setDraggable(true);
        self.eHandle.on('dragstart', function(e) {
          var startTouchPos = self.stage.getTouchPosition();
          var pos = self.eEdit.getPosition();
          var baseX = pos.x;
          var baseY = pos.y;
          var w = self.eEdit.getWidth();
          var h = self.eEdit.getHeight();
          var halfW = w * 0.5;
          var halfH = h * 0.5;
          var startRadius =  App.Math.getDistanceFromTwoPoint(baseX, baseY, baseX + halfW, baseY - halfH);
          var startAspectRadian = Math.atan2(halfH, halfW);
          //var startRadian = self.eEdit.getRotation();
          clearInterval(self.timerHandle);
          self.timerHandle = setInterval(function() {
            moveHandle(baseX, baseY, startRadius, startAspectRadian);
          }, 25);

        });
        self.eHandle.on('dragend', function(e) {
          clearInterval(self.timerHandle);
          _setHandleToRightTop(self.eEdit);
          self.baseLayer.batchDraw();
        }); 
        self.baseLayer.batchDraw();
        if (navigator.userAgent.match(/Android/i)) {
          $("canvas").parents("*").css("overflow", "visible");
        }
      };
      var eHandle = new Kinetic.Image({
        image: imageObj,
        x: 0,
        y: 0,
        width: self.options.handleWidth,
        height: self.options.handleHeight,
        offset: [20, 20],
        draggable: false,
        id: 'handle',
        name: 'handle',
      });
      self.eHandle = eHandle;
      self.baseLayer.add(self.eHandle);
    }

    function moveHandle(baseX, baseY, startRadius, startAspectRadian) {
      var touchPos = self.stage.getTouchPosition();
      var handlePos = self.eHandle.getPosition();
      var radius = App.Math.getDistanceFromTwoPoint(baseX, baseY, handlePos.x, handlePos.y);
      var scale = radius / startRadius;
      self.eEdit.setScale(scale);
      var dx = baseX - handlePos.x;
      var dy = baseY - handlePos.y;
      var radian = Math.atan2(dy, dx);
      //self.eEdit.setRotation(startRadian + radian - Math.PI * 90);
      //self.eEdit.setRotation(radian - startAspectRadian);
      self.eEdit.setRotation(radian + startAspectRadian -  Math.PI);
    }
  };

  var _stageTouchMove = function(e) { 
    var self = App.EditPhoto;
    var eEdit = self.eEdit;
    if (!eEdit) return;
    var touch1 = e.touches[0];
    var touch2 = e.touches[1];
    if (touch1 && touch2 && !eEdit.isLocked) {
      eEdit.isPinching = true;
      eEdit.setDraggable(false);
      if (eEdit.startDistance === undefined) {
        eEdit.startScale = eEdit.getScale().x;
        eEdit.startDistance = App.Math.getDistance(touch1, touch2);
        eEdit.startRotation = eEdit.getRotationDeg();
        eEdit.startTouchRadian = App.Math.getRadianByTwoPoint(touch1, touch2);
        eEdit.startTouchRotation = eEdit.startTouchRadian * 180 / Math.PI;
        eEdit.fire('pinchstart', e, true);
        self.ePinch = eEdit;
      }
      else {
        var dist = App.Math.getDistance(touch1, touch2);
        var scale = (dist / eEdit.startDistance) * eEdit.startScale;
        if (scale < eEdit.minScale) { scale = eEdit.minScale; }
        if (scale > eEdit.maxScale) { scale = eEdit.maxScale; }
        eEdit.setScale(scale, scale);
        var touchRotation = App.Math.getRadianByTwoPoint(touch1, touch2) * 180 / Math.PI;
        eEdit.setRotationDeg(eEdit.startRotation + (touchRotation - eEdit.startTouchRotation) );
        self.baseLayer.batchDraw();
      }
    }
  };

  var _stageTouchEnd = function(e) {
    var self = App.EditPhoto;
    //$(document).trigger(self.CHANGE_EDIT_ITEM);
    var eEdit = self.eEdit;
    if (!eEdit) return;
    if (eEdit.isEditing && eEdit.isPinching) {
      eEdit.fire('pinchend', e, true);
    }
    eEdit.isPinching = false;
    if (eEdit.isLocked) return;
    if (eEdit.hc.usable) eEdit.setDraggable(true);
    eEdit.startDistance = undefined;
    eEdit.startScale = eEdit.getScale().x;
  };

  /**
   * get the new coordinate of the eHandle
   * @param {Kinetic.Group} elm,the editable elm
   */
  var _getRightTopPoint = function(elm) {
    var pos = elm.getPosition();
    var baseX = pos.x;
    var baseY = pos.y;
    var w = elm.getWidth();
    var h = elm.getHeight();
    var halfW = w * 0.5;
    var halfH = h * 0.5;
    var scale = elm.getScale();
    // 2点間の距離
    var radius = App.Math.getDistanceFromTwoPoint(baseX, baseY, baseX + halfW * scale.x, baseY - halfH * scale.y);
    // 2点間の角度(ラジアン)
    var radian = Math.atan2(halfH, halfW);
    var targetX = pos.x + radius * Math.cos(elm.getRotation() - radian);
    var targetY = pos.y + radius * Math.sin(elm.getRotation() - radian);
    // 右上角の座標
    return { x: targetX, y: targetY };
  };

  /**
   * set the eHandle to Right/Top of the specific item
   * @param {Kinetic.Group} elm
   */
  var _setHandleToRightTop = function(elm) {
    var self = App.EditPhoto;
    var rightTopPos = _getRightTopPoint(elm);
    self.eHandle.setPosition(rightTopPos.x, rightTopPos.y);
  };

  /**
   * redraw the stage and reset the Zindex of eBg and eHandle
   */
  var _render = function() {
    var self = App.EditPhoto;
    if (self.eBg) self.eBg.moveToBottom();
    if (self.eHandle) self.eHandle.moveToTop();
    //self.eHandle.setZIndex(self.eEdit.getZIndex());
    if (self.baseLayer) 
      self.baseLayer.batchDraw();
  };


    App.EditPhoto = {
      options:{
        stageWidth: 320,  // default canvas width
        stageHeight: 320, // default canvas height
        stageBgColor: '#221100',  // default canvas bg color
        handleImagePath: 'img/handle.png',  // the handle
        handleWidth: 40, // default handle width 
        handleHeight: 40,// default handle height
        editingStrokeColor: '#62CDD8', // default stroke color when editing the specific photo
        lockedStrokeColor: '#F0F0F0', // default stroke color when the specific photo locked
        editingStrokeWidth: 6, // default stroke width 
        canvasContainer:'photoCanvasContainer' // the div contains the canvas 
      },
      stage: null, // the only canvas
      baseLayer: null,// the only layer
      eBg: null, // the container of all the photos which is a rectangle
      eHandle: null,
      eEdit: null, // the item being edited
      originals: {},
      timerHandle: null,

      /**
       * init the canvas
       * @param {json} options
       */
      init: function(options) {
        var self = App.EditPhoto;
        $.extend(self.options,options);   
        _setStage();
        _setBaseLayer();
        _createHandle();
        var content = self.stage.getContent();
        content.addEventListener("touchmove", _stageTouchMove, false);
        content.addEventListener("touchend", _stageTouchEnd, false);
      },

      /**
       * clear and dispose the canvas resources
       */
      clear: function() {
        var self = App.EditPhoto;
        var content = self.stage.getContent();
        content.removeEventListener("touchmove", self.stageTouchMove);
        content.removeEventListener("touchend", self.stageTouchEnd);
        self.stage.clear();
        content.parentNode.removeChild(content);
        self.stage = null;
        self.baseLayer = null;
        self.eHandle = null;
        self.eBg = null;
        self.eHandle = null;
      },

      /**
       * clear all the decoration imgs on the canvas 
       */
      clearAllDecos: function() {
        var self = App.EditPhoto;
        self.baseLayer.get('.group').each(function(elm) {
          if (elm.hc.type == 'deco') {
            elm.destroy();
          }
        });
        self.eEdit = null;
        self.eHandle.hide();
      },



      /**
       * change the specific item editable status
       * @param {Kinetic.Group} currentElm
       */
      changeEditItem: function(currentElm) {
        var self = App.EditPhoto;
        if (currentElm.getOpacity() < 1) {
          self.changeEditMode(currentElm, false);
        } else {
          self.changeToPreviewMode();
          self.changeEditMode(currentElm, true);
        }
      },

      /**
       * make the specific bgGroup editable or not
       * @param {Kinetic.Group} elm
       * @param {boolen} edit
       */
      changeEditMode: function(elm, edit) {
        var self = App.EditPhoto;
        if (self.eEdit) self.eEdit.isEditing = false;
        if (edit) {
          elm.get('.bg').each(function(elm) { 
            elm.enableStroke();
            //elm.strokeEnabled(true);
          });
          elm.isEditing = true;
          self.eEdit = elm;
          elm.setOpacity(0.9);
          if(!self.eEdit.isLocked) self.eHandle.show();
          self.eHandle.moveToTop();
        } else {
          elm.get('.bg').each(function(elm){ 
            elm.disableStroke();
            //elm.strokeEnabled(false);
          });
          elm.setOpacity(1);
          self.eHandle.hide();
          self.eEdit = null;
        }
      },

      /**
       * change the stage into preview mode
       */
      changeToPreviewMode: function() {
        var self = App.EditPhoto;
        self.baseLayer.get('.group').each(function(elm) {
          self.changeEditMode(elm, false);
        });
        self.eHandle.hide();
      },

      /**
       * lock or unlock the specific edit item
       */
      toggleLockEditItem: function() {
        var eEdit = App.EditPhoto.eEdit;
        if (eEdit) {
          if (eEdit.isLocked) {
            if(eEdit.hc.usable)eEdit.setDraggable(true);
            eEdit.get('.bg').each(function(elm) {
              //console.log(App.EditPhoto.editingStrokeColor);
              elm.setStroke(App.EditPhoto.editingStrokeColor);
              App.EditPhoto.eHandle.show();
            });
          } else {
            eEdit.setDraggable(false);
            eEdit.get('.bg').each(function(elm) {
              //console.log(App.EditPhoto.lockedStrokeColor);
              elm.setStroke(App.EditPhoto.lockedStrokeColor);
              App.EditPhoto.eHandle.hide();
            });
          }
          eEdit.isLocked = !eEdit.isLocked;
          _render();
        }
      },

      /**
       * remove the current being edited image from canvas
       */
      removeEditItem: function() {
        var self = App.EditPhoto;
        if (self.eEdit) {
          self.eEdit.destroy();
          self.eEdit = null;
        }
        if (self.eHandle) self.eHandle.hide();
        _render();
        //$(document).trigger(self.CHANGE_EDIT_ITEM);
      },

      /**
       *  use this method to add photo to stage regardless of from album or app local pngs
       *  @param {string} uri,such as 'path/img.png' or the parameter of the callback function when
       *  calling camera or photo api of phonegap
       *  @param {json} options,{type:'photo'} used to indicate the img won't be removed by
       *  clearAllDecos function
       */
      addImage: function(uri, options) {
        var _loadImage = function(uri,callback){
          var imageObj = new Image();
          imageObj.onload = function(){
            callback(imageObj,options);
          };
          imageObj.src = uri;
        };

        _loadImage(uri, function(imageObj,options){
          // the method used to draw the photo on the stage with the options
          var _createDecoImage = function(imageObj,options){
            var self = App.EditPhoto;
            var type = 'deco';//the default type,the other type is 'photo'
            var id = '';
            var tmpW = Math.floor(imageObj.width * 0.5);
            var w = Math.min(tmpW, 310);
            var scaleX = 1;
            var degree = 0;
            var position = { x: (self.stage.getWidth() * 0.5), y: (self.stage.getHeight() * 0.5) };
            var usable = true;
            var filter = 0;
            var nonfilter = false;
            var callback = null;

            if (options) {
              if (options.id) id = options.id;
              if (options.degree) degree  = options.degree;
              if (options.position) position = options.position;
              if (options.w) {
                w = options.w;
              }
              if (options.scaleX) scaleX = options.scaleX;
              if (options.type) type = options.type;
              if (options.usable === false) usable = false;
              if (options.filter > 0) filter = App.Data.filtersByIdNum[options.filter].index;
              if (options.nonfilter) nonfilter = true;
              if (options.callback) callback = options.callback;
            }

            var h = imageObj.height * w / imageObj.width;
            var imgHalfW = w * 0.5,
            imgHalfH = h * 0.5;

            // Kinetic.Group as the container of photo 
            var bgGroup = new Kinetic.Group({
              x: position.x,
              y: position.y,
              width: w,
              height: h,
              offset: [imgHalfW, imgHalfH],
              rotationDeg: degree,
              draggable: usable,
              id: 'group_' + count++,
              name: 'group',
              layer: self.baseLayer
            });

            //TODO
            bgGroup.hc = {
              id: id, 
              type : type,//may 'deco' or 'photo'
              image: imageObj,
              usable: usable,
              filter: filter,
              nonfilter: nonfilter
            };

            // Kinetic.Image wrap the photo 
            var bgImg = new Kinetic.Image({
              image: imageObj,
              x: imgHalfW,
              y: imgHalfH,
              width: w,
              height: h,
              scaleX: scaleX,
              offset: [imgHalfW, imgHalfH],
              draggable: false,
              stroke: self.options.editingStrokeColor,
              strokeWidth: self.options.editingStrokeWidth,
              strokeScaleEnabled: false,
              strokeEnabled: false,
              name: 'bg',
            });

            // set the handler position on the top right of bgGroup which contains the photo
            var rightTopPos = _getRightTopPoint(bgGroup);
            self.eHandle.setPosition(rightTopPos.x, rightTopPos.y);
            var touchStart = null;
            bgGroup.on('touchstart', _.throttle(function(e) {
              console.log('bgGroup,touchstart');
              var that = this;
              if (that.isEditing && that.isPinching) return; 
              touchStart = self.stage.getTouchPosition();
              _setHandleToRightTop(that);
              if (that.isLocked) return; 
              /*if (that.hc.usable == false && that.hc.id) {
                var itemData = App.Data.Hearts.itemsObj[that.hc.id];
                var tab = itemData.tab;
                if (tab) {
                var userdata = App.db.getUserdata();
                if (userdata[tab.id]) {
                that.setDraggable(true);
                that.hc.usable = true;
                }
                }
                }*/
            }, 300));

            bgGroup.on('touchend',_.throttle(function(e){
              console.log('bgGroup,touchend');
              var that = this;
              if(that.isEditing && that.isPinching && !self.eEdit.isPinching) return;
              var nowTouch = self.stage.getTouchPosition();
              if (touchStart) {
                if (Math.abs(touchStart.x - nowTouch.x) < 4 && Math.abs(touchStart.y - nowTouch.y) < 4 ) {
                  self.changeEditItem(that);
                }
              }
              clearInterval(self.timerHandle);
              if (!this.isLocked && this.hc.usable) {
                this.setDraggable(true);
              }
              self.baseLayer.batchDraw();
            },300));

            bgGroup.on('dragstart', _.throttle(function(e){
              console.log('bgGroup,dragstart');
              var that = this;
              //if(this.isPinching) return;
              this.get('.bg').each(function(elm) { elm.setOpacity(0.3); });
              self.changeToPreviewMode();
              self.changeEditMode(that, true);
              clearInterval(self.timerHandle);
              self.timerHandle = setInterval(function() {
                _setHandleToRightTop(that);
              }, 25);
            },300));

            bgGroup.on('dragend', _.throttle(function(e){
              console.log('bgGroup,dragend');
              var that = this;
              //if(this.isPinching) return;
              this.get('.bg').each(function(elm) { elm.setOpacity(1); });
              clearInterval(self.timerHandle);
              _setHandleToRightTop(that);
              self.baseLayer.batchDraw();
            },300));

            bgGroup.on('pinchstart', _.throttle(function(e){
              var that = this;
              console.log(this.getAttr('id') + ' pinchstart!---');
              self.eHandle.setDraggable(false);
              self.changeEditMode(that, true);
              clearInterval(self.timerHandle);
              self.timerHandle = setInterval(function() {
                _setHandleToRightTop(that);	
              }, 25);
            },300));

            bgGroup.on('pinchend', _.throttle(function(e){
              var that = this;
              console.log(this.getAttr('id') + ' pinchend!---');
              this.get('.bg').each(function(elm) { elm.setOpacity(1); });
              if(that.hc.usable) self.eHandle.setDraggable(true);
              clearInterval(self.timerHandle);
              _setHandleToRightTop(that);
              self.baseLayer.batchDraw();
            },300));

            bgGroup.add(bgImg);
            self.baseLayer.add(bgGroup);
            self.changeEditItem(bgGroup);
            //$(document).trigger(self.CHANGE_EDIT_ITEM);
            setTimeout(function() {self.baseLayer.draw();}, 100);

            if (filter > 0) {
              self.addFilter(App.Data.filters[filter].filter, callback);
            } else {
              if (callback) { callback(bgGroup); };
            }
          };
          _createDecoImage(imageObj, options);
        });
      },

      addFilter: function(filter, callback) {
        var self = App.EditPhoto;
        if (self.eEdit) {
          self.removeFilter();
          self.originals[self.eEdit.getId()] = self.eEdit.clone();
          self.originals[self.eEdit.getId()].remove();
          self.eEdit.get('.bg').each(function(elm){
            //elm.applyFilter(filter, options, callback);
            if (!callback) App.Spinner.show();
            setTimeout(function() {
              elm.setFilter(filter);
              _render();
              if (callback) {
                callback();
              } else {
                App.Spinner.hide();
              } 
            },50);
          });
        } else {
          if (callback) callback();
        }
      },

      removeFilter: function() {
        var self = App.EditPhoto;
        var id = self.eEdit.getId();
        var original = self.originals[id];
        if (original) {
          var zIndex = self.eEdit.getZIndex();
          original.setRotation(self.eEdit.getRotation());
          original.setPosition(self.eEdit.getPosition());
          original.setScale(self.eEdit.getScale());
          original.hc = self.eEdit.hc;
          original.isLocked = self.eEdit.isLocked;
          if (self.eEdit.isLocked) { original.setDraggable(false); }
          else { if (self.eEdit.hc.usable) original.setDraggable(true); }
          original.get('.bg').each(function(elm) {
            // 現状のスケールを反映
            var scaleX;
            self.eEdit.get('.bg').each(function(elm) { scaleX = elm.getScaleX(); });
            //console.log('scaleX = ' + scaleX);
            elm.setScaleX(scaleX);
            // 現状の外枠色を反映（ロック/非ロック）
            if (self.eEdit.isLocked) { 
              elm.setStroke(self.options.lockedStrokeColor); 
            } else { 
              elm.setStroke(self.options.editingStrokeColor); 
            }
          });
          self.eEdit.destroy();
          self.baseLayer.add(original);
          //self.changeEditItem(original);
          self.eEdit = original;
          self.eEdit.setZIndex(zIndex);
          self.originals[id] = null;
        }
      },

      /**
       * return all the photos except the decoration imgs
       */
      getPhotos: function() {
        var self = App.EditPhoto;
        var a = [];
        self.baseLayer.get('.group').each(function(elm) {
          if (elm.hc.type == 'photo') {
            a.push(elm.hc.image);
          }
        });
        return a;
      }
  };

  App.Math = {
    getDistanceFromTwoPoint: function(x1, y1, x2, y2) {
      　　var dx, dy, d;
      　　dx = x1 - x2;
      　　dy = y1 - y2;
      　　d = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2));
      　　return d;
    },

    getDistance: function(touch1, touch2) {
      var x1 = touch1.clientX;
      var x2 = touch2.clientX;
      var y1 = touch1.clientY;
      var y2 = touch2.clientY;
      return Math.sqrt(((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1)));
    },

    getRadianByTwoPoint: function (touch1, touch2) {
      var dx = touch1.clientX - touch2.clientX;
      var dy = touch1.clientY - touch2.clientY;
      return Math.atan2(dy, dx);
    }
  }
  })(App, jQuery);
