var EditPhoto = (function(){

  //the number of groups contained in the layer
  var count = 0;
  
  function EditPhoto(options){
    this.options = {
      stageWidth: 320,  // default canvas width
      stageHeight: 320, // default canvas height
      stageBgColor: '#221100',  // default canvas bg color
      handleImagePath: 'img/handle.png',  // the handle
      handleWidth: 40, // default handle width 
      handleHeight: 40,// default handle height
      editingStrokeColor: '#62CDD8', // default stroke color when editing the specific photo
      lockedStrokeColor: '#F0F0F0', // default stroke color when the specific photo locked
      editingStrokeWidth: 1, // default stroke width 
      canvasContainer:'photoCanvasContainer', // the div contains the canvas
      enableHandle: false, //enable/disable the handle
      enableEditingStroke: false //enable/disable the stroke when image being edited
    };
    this.stage = null; // the only canvas
    this.baseLayer = null;// the only layer
    this.eBg = null; // the container of all the photos which is a rectangle
    this.eHandle = null;
    this.eEdit = null; // the item being edited
    this.originals = {};
    this.timerHandle = null;
     
    $.extend(this.options,options); 
    _setStage.apply(this,null);
    _setBaseLayer.apply(this,null);
    //Optimise for android
    if (navigator.userAgent.match(/Android/i)) {
      $("canvas").parents("*").css("overflow", "visible");
    }
    if(options.enableHandle)
      _createHandle.apply(this,null);
    var self = this; 
    var content = this.stage.getContent();
    //It seems that the performance of 'content.addEventListener' better than
    //"stage.on('touchmove',_.throttle(..."
    
    content.addEventListener("touchmove", function(e){
      _stageTouchMove.call(self,e);   
    }, false);
    content.addEventListener("touchend", function(e){
      _stageTouchEnd.call(self,e);
    }, false);
   
  };
  
  // stage > baseLayer > eBg 
  //                    > bgGroup > photo [                                        
  //                                        the editable bgGroup
  //                    > bgGroup > deco     means the "eEdit"
  //                    > bgGroup > deco  ]  
  //                   > eHandle
  var _setStage = function() {
    var self = this;
    if (!self.stage) {
      self.stage = new Kinetic.Stage({
        container: self.options.canvasContainer,
        width: self.options.stageWidth,
        height: self.options.stageHeight
      });
    }
  };

  var _setBaseLayer = function() {
    var self = this;
    if (!self.baseLayer) {
      self.baseLayer = new Kinetic.Layer(
        //Performance OPTIMISE
        {hitGrapeEnabled: false} 
      );
      self.eBg = new Kinetic.Rect({
        x:0,
        y:0,
        width: self.options.stageWidth,
        height: self.options.stageHeight,
        fill: self.options.stageBgColor,
        id: 'bg',
        //Performance OPTIMISE
        transformsEnabled: 'position'
      });
      self.eBg.on('touchend', _.throttle(function(e){
        if (self.eEdit) {
          if (self.eEdit.isPinching) return;
        }
        self.changeToPreviewMode();
        _render.call(self,null);
      },300));
      self.baseLayer.add(self.eBg);
      self.stage.add(self.baseLayer);
    }
  };

  var _createHandle = function() {
    var self = this;
    if (!self.eHandle) {
      var imageObj = new Image();
      imageObj.src = self.options.handleImagePath;
      imageObj.onload = function() {
        self.eHandle.setDraggable(true);
        self.eHandle.on('dragstart', function(e) {
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
            moveHandle.call(self, baseX, baseY, startRadius, startAspectRadian);
          }, 25);
        });
        self.eHandle.on('dragend', function(e) {
          clearInterval(self.timerHandle);
          _setHandleToRightTop.call(self,self.eEdit);
          self.baseLayer.batchDraw();
        }); 
        
      };
      var eHandle = new Kinetic.Image({
        image: imageObj,
        x: 0,
        y: 0,
        width: self.options.handleWidth,
        height: self.options.handleHeight,
        offsetX: self.options.handleWidth>>1,
        offsetY: self.options.handleHeight>>1, 
        id: 'handle',
        name: 'handle',
      });
      self.eHandle = eHandle;
      self.baseLayer.add(self.eHandle);
    }

    function moveHandle(baseX, baseY, startRadius, startAspectRadian) {
      var self = this;
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

  var _stageTouchMove = function(e){
    var self = this;
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
    var self = this;
    //$(document).trigger(self.CHANGE_EDIT_ITEM);
    var eEdit = self.eEdit;
    if (!eEdit) return;
    if (eEdit.isEditing && eEdit.isPinching) {
      eEdit.fire('pinchend', e, true);
    }
    eEdit.isPinching = false;
    if (eEdit.isLocked) return;
    if (eEdit.customAttr.usable) eEdit.setDraggable(true);
    eEdit.startDistance = undefined;
    eEdit.startScale = eEdit.getScale().x;
  };

  /**
   * get the new coordinate of the eHandle
   * @param {Kinetic.Group} elm,the editable elm
   */
  var _getRightTopPoint = function(elm) {
    var options = this.options;
    var pos = elm.getPosition();
    var baseX = pos.x;
    var baseY = pos.y;
    var w = elm.getWidth();
    var h = elm.getHeight();
    var halfW = w * 0.5;
    var halfH = h * 0.5;
    var scale = elm.getScale();
    var radius = App.Math.getDistanceFromTwoPoint(baseX, baseY, baseX + halfW * scale.x, baseY - halfH * scale.y);
    var radian = Math.atan2(halfH, halfW);
    var targetX = pos.x + radius * Math.cos(elm.getRotation() - radian);
    var targetY = pos.y + radius * Math.sin(elm.getRotation() - radian);
    //console.log('baseX:%s,baseY:%s,scaleX:%s,scaleY:%s',baseX,baseY,scale.x,scale.y);
    return { x: targetX, y: targetY };
  };

  /**
   * set the eHandle to Right/Top of the specific item
   * @param {Kinetic.Group} elm
   */
  var _setHandleToRightTop = function(elm) {
    var self = this;
    if(self.eHandle && self.options.enablehandle){
      var rightTopPos = _getRightTopPoint.call(self,elm);
      self.eHandle.setPosition(rightTopPos);
    }
  };

  /**
   * redraw the stage and reset the Zindex of eBg and eHandle
   */
  var _render = function() {
    var self = this;
    if (self.eBg) self.eBg.moveToBottom();
    if (self.eHandle) self.eHandle.moveToTop();
    //self.eHandle.setZIndex(self.eEdit.getZIndex());
    if (self.baseLayer) 
      self.baseLayer.batchDraw();
  };

  var _bindEvt = function(editPhoto,ename){
    var self = editPhoto;
    var bgGroup = this;
    // set the handler position on the top right of bgGroup which contains the photo
    _setHandleToRightTop.call(self,bgGroup);
    var touchStart = null;
    
    bgGroup.on('touchstart', _.throttle(function(e) {
      console.log('_bindEvt,touchstart');
      var that = this;
      if (that.isEditing && that.isPinching) return; 
      touchStart = self.stage.getTouchPosition();
      _setHandleToRightTop.call(self,that);
      if (that.isLocked) return; 
    }, 300));

    bgGroup.on('touchend',_.throttle(function(e){
      console.log('_bindEvt,touchend');
      var that = this;
      if(that.isEditing && that.isPinching && !self.eEdit.isPinching) return;
      var nowTouch = self.stage.getTouchPosition();
      if (touchStart) {
        if (Math.abs(touchStart.x - nowTouch.x) < 4 && Math.abs(touchStart.y - nowTouch.y) < 4 ) {
          self.changeEditItem(that);
        }
      }
      clearInterval(self.timerHandle);
      if (!this.isLocked && this.customAttr.usable) {
        this.setDraggable(true);
      }
      self.baseLayer.batchDraw();
    },300));
   
    bgGroup.on('dragstart', _.throttle(function(e){
      console.log('_bindEvt,dragstart');
      var that = this;
      //if(this.isPinching) return;
      this.get('.'+ename).each(function(elm) { elm.setOpacity(0.3); });
      self.changeToPreviewMode();
      self.changeEditMode(that, true);
      clearInterval(self.timerHandle);
      self.timerHandle = setInterval(function() {
        _setHandleToRightTop.call(self,that);      
      }, 25);
    },300));

    bgGroup.on('dragend', _.throttle(function(e){
      console.log('_bindEvt,dragend');
      var that = this;
      //if(this.isPinching) return;
      this.get('.'+ename).each(function(elm) { elm.setOpacity(1); });
      clearInterval(self.timerHandle);
      _setHandleToRightTop.call(self,that);
      self.baseLayer.batchDraw();
    },300));

    bgGroup.on('pinchstart', _.throttle(function(e){
      var that = this;
      console.log(this.getAttr('id') + ' pinchstart!---');
      self.eHandle.setDraggable(false);
      self.changeEditMode(that, true);
      clearInterval(self.timerHandle);
      self.timerHandle = setInterval(function() {
        _setHandleToRightTop.call(self,that);
      }, 25);
    },300));

    bgGroup.on('pinchend', _.throttle(function(e){
      var that = this;
      console.log(this.getAttr('id') + ' pinchend!---');
      this.get('.'+name).each(function(elm) { elm.setOpacity(1); });
      if(that.customAttr.usable) self.eHandle.setDraggable(true);
      clearInterval(self.timerHandle);
      _setHandleToRightTop.call(self,that);
      self.baseLayer.batchDraw();
    },300));
    
    
    //dbltap works fine in mobile especially android,dblclick works fine in desktop.
    bgGroup.on('dbltap', _.throttle(function(e){
      var that = this;
      console.log('_bindEvt,dbltap');
      self.changeEditMode(that,true);
      self.removeEditItem();
    },300));
  }

  /**
   * clear and dispose the canvas resources
   */
  EditPhoto.prototype.clear = function(){
    var self = this;
    var content = self.stage.getContent();
    content.removeEventListener("touchmove", _stageTouchMove);
    content.removeEventListener("touchend", _stageTouchEnd);
    self.stage.clear();
    content.parentNode.removeChild(content);
    self.stage = null;
    self.baseLayer = null;
    self.eHandle = null;
    self.eBg = null;
    self.eHandle = null; 
  };

  /**
   * clear all the decoration imgs on the canvas 
   */
  EditPhoto.prototype.clearAllDecos = function() {
    var self = this;
    self.baseLayer.get('.group').each(function(elm) {
      if (elm.customAttr.type == 'deco') {
        elm.destroy();
      }
    });
    self.eEdit = null;
    self.eHandle.hide();
  };

  /**
   * change the specific item editable status
   * @param {Kinetic.Group} currentElm
   */
  EditPhoto.prototype.changeEditItem = function(currentElm) {
    if(currentElm.customAttr && currentElm.customAttr.usable){
      var self = this;
      if (currentElm.getOpacity() < 1) {
        self.changeEditMode(currentElm, false);
      } else {
        self.changeToPreviewMode();
        self.changeEditMode(currentElm, true);
      } 
    }
  };

  /**
   * make the specific bgGroup editable or not
   * @param {Kinetic.Group} elm
   * @param {boolen} edit
   */
  EditPhoto.prototype.changeEditMode = function(elm, edit) {
    var self = this;
    if (self.eEdit) self.eEdit.isEditing = false;
    if (edit) {
      elm.get('.itemWithStroke').each(function(elm){
        if(self.options.enableEditingStroke){
          if(typeof elm.enableStroke === 'function')
            elm.enableStroke()
          else
            elm.strokeEnabled(true);
        }
      });
      elm.isEditing = true;
      self.eEdit = elm;
      elm.setOpacity(0.9);
      if(self.eHandle){
        if(!self.eEdit.isLocked) self.eHandle.show();
        self.eHandle.moveToTop();
      }
    } else {
      elm.get('.itemWithStroke').each(function(elm){ 
        if(self.options.enableEditingStroke){
          if(typeof elm.disableStroke === 'function')
            elm.disableStroke()
          else
            elm.strokeEnabled(false);
        }
      });
      elm.setOpacity(1);
      if(self.eHandle)
        self.eHandle.hide();
      self.eEdit = null;
    }
  };

  /**
   * change the stage into preview mode
   */
  EditPhoto.prototype.changeToPreviewMode = function() {
    var self = this;
    self.baseLayer.get('.group').each(function(elm) {
      self.changeEditMode(elm, false);
    });
    if(self.eHandle)
      self.eHandle.hide();
    self.baseLayer.batchDraw();
  };

  /**
   * lock or unlock the specific edit item
   */
  EditPhoto.prototype.toggleLockEditItem = function() {
    var eEdit = this.eEdit;
    if (eEdit) {
      if (eEdit.isLocked) {
        if(eEdit.customAttr.usable)eEdit.setDraggable(true);
        eEdit.get('.itemWithStroke').each(function(elm) {
          elm.setStroke(this.options.editingStrokeColor);
          this.eHandle.show();
        });
      } else {
        eEdit.setDraggable(false);
        eEdit.get('.itemWithStroke').each(function(elm) {
          elm.setStroke(this.options.lockedStrokeColor);
          this.eHandle.hide();
        });
      }
      eEdit.isLocked = !eEdit.isLocked;
      _render.call(this,null);
    }
  };

  /**
   * remove the current being edited image from canvas
   */
  EditPhoto.prototype.removeEditItem = function() {
    var self = this;
    if (self.eEdit) {
      self.eEdit.destroy();
      self.eEdit = null;
    }
    if (self.eHandle) self.eHandle.hide();
    _render.call(self,null);
    //$(document).trigger(self.CHANGE_EDIT_ITEM);
  };

  /**
   *  use this method to add photo to stage regardless of from album or app local pngs
   *  @param {string} uri,such as 'path/img.png' or the parameter of the callback function when
   *  calling camera or photo api of phonegap
   *  @param {json} options,{type:'photo'} used to indicate the img won't be removed by
   *  clearAllDecos function
   */
  EditPhoto.prototype.addImage = function(uri, options) {
    var imageObj = new Image();
    var self = this;
    imageObj.onload = function(){
      //TODO:the width value
      //var w = Math.min(Math.floor(imageObj.width>>1));
      var w = options.w || imageObj.width;
      var h = imageObj.height * w / imageObj.width;
      var defaultoptions = {
        type:'deco',//the default type,the other type is 'photo'
        id:'',
        w:w,
        h:h,
        imgHalfW:w>>1,
        imgHalfH:h>>1,
        scaleX:1,
        degree:0,
        position:{ x: (self.stage.getWidth()>>1), y: (self.stage.getHeight()>>1) },
        usable:true,
        callback:null
      };
      $.extend(defaultoptions,options);
      var bgGroup = new Kinetic.Group({
        x: defaultoptions.position.x,
        y: defaultoptions.position.y,
        width: defaultoptions.w,
        height: defaultoptions.h,
        offsetX: defaultoptions.imgHalfW,
        offsetY: defaultoptions.imgHalfH,
        rotationDeg: defaultoptions.degree,
        draggable: defaultoptions.usable,
        id: 'group_' + count++,
        listening: defaultoptions.usable,
        dragOnTop: defaultoptions.dragOnTop || false,
        name: 'group'
      });

      bgGroup.customAttr = {
        id: defaultoptions.id, 
        type : defaultoptions.type,//may 'deco' or 'photo'
        usable: defaultoptions.usable
      };

       // Kinetic.Image wrap the photo 
      var bgImg = new Kinetic.Image({
        image: imageObj,
        x: defaultoptions.imgHalfW,
        y: defaultoptions.imgHalfH,
        width: defaultoptions.w,
        height: defaultoptions.h,
        scaleX: defaultoptions.scaleX,
        offsetX: defaultoptions.imgHalfW, 
        offsetY: defaultoptions.imgHalfH,
        draggable: false,
        stroke: self.options.editingStrokeColor,
        strokeWidth: self.options.editingStrokeWidth,
        strokeScaleEnabled: false,
        strokeEnabled: false,
        name: 'itemWithStroke',
        opacity: options.opacity || 1
      });
            
      if(defaultoptions.usable){
        _bindEvt.call(bgGroup,self,'itemWithStroke');
        self.changeEditItem(bgGroup);
      }
      bgGroup.add(bgImg);
      self.baseLayer.add(bgGroup);
      self.baseLayer.batchDraw();
      if(options.callback && typeof options.callback === 'function'){
        options.callback.call(self,bgGroup);
      }
    };
    imageObj.src = uri;
  };

  EditPhoto.prototype.addText = function(text,options){
    var self = this;
    var defaultoptions = {
      text: text || 'Holy',
      fontFamily: 'Calibri',
      fill: 'green',
      fillbg: '',
      padding: 10,
      align: 'left',
      fontSize: 18,
      width:150,
      height:80,
      strokebg:self.options.editingStrokeColor,
      strokeWidthbg:self.options.editingStrokeWidth,
      usable:true
    };
    $.extend(defaultoptions,options);
    var bgText = new Kinetic.Text(defaultoptions);
    var halfw = defaultoptions.width>>1;
    var halfh = defaultoptions.height>>1; 
    var txtGroup = new Kinetic.Label({
      width:defaultoptions.width,
      height:defaultoptions.height,
      name:'text'
    });

    txtGroup.add(new Kinetic.Tag({
      fill: defaultoptions.fillbg,
      stroke: defaultoptions.strokebg,
      strokeWidth: defaultoptions.strokeWidthbg,
      name:'itemWithStroke',
      strokeEnabled:false
    }));

    //the x/y and offsetX/Y seems important!
    var position = { x: (self.stage.getWidth()>>1), y: (self.stage.getHeight()>>1) };
    var bgGroup = new Kinetic.Group({
      x: (defaultoptions.x + halfw) || position.x,
      y: (defaultoptions.y + halfh) || position.y,
      width:defaultoptions.width,
      height:defaultoptions.height,
      offsetX:halfw,
      offsetY:halfh,
      id: 'group_' + count++,
      name: 'group',
      draggable:defaultoptions.usable,
      listening:defaultoptions.usable
    });

    bgGroup.customAttr = {
      usable:defaultoptions.usable,
      type:'text'
    };

    if(defaultoptions.usable){
      _bindEvt.call(bgGroup,self,'text');
      self.changeEditItem(bgGroup);
    } 
    txtGroup.add(bgText);
    bgGroup.add(txtGroup);
    self.baseLayer.add(bgGroup);
    self.baseLayer.batchDraw();
    if(options.callback && typeof options.callback === 'function'){
      options.callback.call(self,bgGroup);
    }
  };
   
  var App = {};
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
  };

  return EditPhoto;
})();
