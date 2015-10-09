/*jslint white:true, nomen: true, plusplus: true */
/*global mx, define, require, browser, devel, console, document, jQuery, mxui, dojo */
/*mendix */
define([
	'dojo/_base/declare',
	'mxui/widget/_WidgetBase',
	'dijit/_TemplatedMixin',
	'mxui/dom',
	'dojo/dom-class',
	'dojo/dom-style',
	'dojo/dom-construct',
	'dojo/dom-attr',
	'dojo/_base/lang',
	'dojo/html',
	'dojo/_base/array', 
	'dojo/text!SimpleCheckboxSetSelector/widget/template/SimpleCheckboxSetSelector.html'
],
	function (declare, _WidgetBase, _TemplatedMixin, dom, dojoClass, dojoStyle, dojoConstruct, dojoAttr, dojoLang, dojoHtml, dojoArray, widgetTemplate) {
		"use strict";

		// Declare widget.
	return declare("SimpleCheckboxSetSelector.widget.SimpleCheckboxSetSelector", [_WidgetBase, _TemplatedMixin], {

			// Template path
			templateString: widgetTemplate,

			// DOM elements
			checkboxComboContainer: null,

			// Parameters configurable in Business Modeler.
			dataSourceType: null,
			dataAssociation: null,
			constraint: "",
			sortAttr: "",
			sortOrder: false,
			displayAttribute: "",
			readonly: false,
			onChangeMicroflow: "",

			// Internal variables. Non-primitives created in the prototype are shared between all widget instances.
			_direction: "vertical",
			_entity: null,      
			_labelAttribute: null,  
			_reference: null,
			_handles: null,
			_contextObj: null,
			_alertDiv: null,
			_checkboxOptions: null,
			_isReadOnly: false,
			_assocName: null,
			_locatedInListview: false,

			/**
			 * Mendix Widget methods.
			 * ======================
			 */
			constructor: function () {
				this._handles = [];
			},

			// DOJO.WidgetBase -> PostCreate is fired after the properties of the widget are set.
			postCreate: function () {

				this._entity = this.dataAssociation.split('/')[1];
				this._reference = this.dataAssociation.split('/')[0];
				this._labelAttribute = this.displayAttribute;
				
				if (this.sortAttr === '') {
					this.sortAttr = this.displayAttribute;
				}
				
				// adjust the template based on the display settings.
				if( this.showLabel ) {
					if (dojoClass.contains(this.checkboxLabel, 'hidden')) {
						dojoClass.remove(this.checkboxLabel, 'hidden');
					}
					
					if(this.formOrientation === "horizontal"){
						// width needs to be between 1 and 11
						var comboLabelWidth = this.labelWidth < 1 ? 1 : this.labelWidth;
						comboLabelWidth = this.labelWidth > 11 ? 11 : this.labelWidth;

						var comboControlWidth = 12 - comboLabelWidth,                    
							comboLabelClass = 'col-sm-' + comboLabelWidth,
							comboControlClass = 'col-sm-' + comboControlWidth;

						dojoClass.add(this.checkboxLabel, comboLabelClass);
						dojoClass.add(this.checkboxComboContainer, comboControlClass);
					}

					this.checkboxLabel.innerHTML = this.fieldCaption;
				}
				else {
					if (!dojoClass.contains(this.checkboxLabel, 'hidden')) {
						dojoClass.add(this.checkboxLabel, 'hidden');
					}
				}
				
				if (this.readOnly || this.get('disabled') || this.readonly) {
					//this.readOnly isn't available in client API, this.get('disabled') works correctly since 5.18.
					//this.readonly is a widget property
					this._isReadOnly = true;
				}

				this._reserveSpace();	

			},

			/**
			 * What to do when data is loaded?
			 */

			update: function (obj, callback) {
				console.debug(this.id + ".update");

				this._contextObj = obj;
				this._resetSubscriptions();
				this._setCheckboxOptions();

				callback();

			},

			_setCheckboxOptions: function () {

				if (this._contextObj) {
					if (this.dataSourceType === "xpath") {
						this._getDataFromXPath();
					} else if (this.dataSourceType === "mf" && this.datasourceMf) {
						this._getDataFromDatasource();
					} else {
						this._showError("Can\"t retrieve objects because no datasource microflow is specified");
					}
				}
				else {
					this._updateRendering();
				}
				
			},

			// Rerender the interface.
			_updateRendering: function () {

				if (this._contextObj !== null) {
					if (dojoClass.contains(this.domNode, 'hidden')) {
						dojoClass.remove(this.domNode, 'hidden');
					}
					this._createCheckboxNodes();
				} 
				else {
					if (!dojoClass.contains(this.domNode, 'hidden')) {
						dojoClass.add(this.domNode, 'hidden');
					}
				}

				// Important to clear all validations!
				this._clearValidations();
			},

			// Handle validations.
			_handleValidation: function (validations) {
				this._clearValidations();

				var validation = validations[0],
					message = validation.getReasonByAttribute(this._reference);

				if (this._isReadOnly ||
					this._contextObj.isReadonlyAttr(this._reference)) {
					validation.removeAttribute(this._reference);
				} else if (message) {
					this._addValidation(message);
					validation.removeAttribute(this._reference);
				}
			},

			// Clear validations.
			_clearValidations: function () {
				dojoConstruct.destroy(this._alertDiv);
				this._alertDiv = null;
			},

			// Show an error message.
			_showError: function (message) {
				if (this._alertDiv !== null) {
					dojoHtml.set(this._alertDiv, message);
					return true;
				}
				this._alertDiv = dojoConstruct.create("div", {
					"class": "alert alert-danger",
					"innerHTML": message
				});
				dojoConstruct.place(this._alertDiv, this.checkboxComboContainer);
			},

			// Add a validation.
			_addValidation: function (message) {
				this._showError(message);
			},

			// Reset subscriptions.
			_resetSubscriptions: function () {

				this.unsubscribe();
				
				if (this._contextObj) {
					//validationHandle =
					this.subscribe({
						guid: this._contextObj.getGuid(),
						val: true,
						callback: dojoLang.hitch(this, this._handleValidation)
					});

					//objectHandle =
					this.subscribe({
						guid: this._contextObj.getGuid(),
						callback: dojoLang.hitch(this, function (guid) {
							this._updateRendering();
						})
					});

					//attrHandle = 
					this.subscribe({
						guid: this._contextObj.getGuid(),
						attr: this._reference,
						callback: dojoLang.hitch(this, function (guid, attr, attrValue) {
							this._updateRendering();
						})
					});

					
				}
			},

			_getDataFromXPath: function () {
				if (this._contextObj) {
					mx.data.get({
						xpath: "//" + this._entity + this.constraint.replace(/\[%CurrentObject%\]/g, this._contextObj.getGuid()),
						filter: {
							limit: 50,
							depth: 0,
							sort: [[this.sortAttr, this.sortOrder]]
						},
						callback: dojoLang.hitch(this, this._populateCheckboxOptions)
					});
				} else {
					console.warn("Warning: No context object available.");
				}
			},

			_getDataFromDatasource: function () {
				this._execMF(this._contextObj, this.datasourceMf, dojoLang.hitch(this, this._populateCheckboxOptions));
			},

			_populateCheckboxOptions: function (objs) {

				var mxObj = null,
					i = 0;
				
				this._checkboxOptions = {};
				for (i = 0; i < objs.length; i++) {

					mxObj = objs[i];

					this._checkboxOptions[mxObj.getGuid()] = mxObj.get(this.displayAttribute);
				}
				
				this._updateRendering();
			},


			_createCheckboxNodes: function (mxObjArr) {
				var mxObj = null,
					i = 0,
					j = 0,
					labelNode = null,
					checkboxNode = null,
					enclosingDivElement = null,
					nodelength = 0;
				
				nodelength = this.checkboxComboContainer.children.length;

				if(this.direction === "horizontal") {
					dojoConstruct.empty(this.checkboxComboContainer);
				}
				
				for (var option in this._checkboxOptions) {
					if (this._checkboxOptions.hasOwnProperty(option)) {

						labelNode = this._createLabelNode(option, this._checkboxOptions[option]);
						checkboxNode = this._createCheckboxNode(option, this._checkboxOptions[option]);

						dojoConstruct.place(checkboxNode, labelNode, "first");

						if(this.direction === "horizontal"){
							dojoConstruct.place(labelNode, this.checkboxComboContainer, "last");
						} else {
							//an enclosing div element is required to vertically align a  in bootstrap. 
							if(this.checkboxComboContainer.children[i])	{
								enclosingDivElement = this.checkboxComboContainer.children[i];
							}
							else
							{
								enclosingDivElement = dojoConstruct.create("div", {"class" : "checkbox"});
							}
							dojoConstruct.place(labelNode, enclosingDivElement, "only");
							if(!this.checkboxComboContainer.children[i]) {
								dojoConstruct.place(enclosingDivElement, this.checkboxComboContainer, "last");
							}
						}

						i++;
					}
				}
				j= i;
				if(j>0) {
					for(j; j <= nodelength; j++)
					{
						dojoConstruct.destroy(this.checkboxComboContainer.children[i]);
					}
				}
					
			},

			_createLabelNode: function (key, value) {

				var labelNode = null,
					spanNode = null;

				labelNode = dojoConstruct.create("label");

				if (this._isReadOnly ||
					this._contextObj.isReadonlyAttr(this._reference)) {
					dojoAttr.set(labelNode, "disabled", "disabled");
					dojoAttr.set(labelNode, "readonly", "readonly");
				}

//				if ("" + this._contextObj.get(this.entity) === key) {
//					dojoClass.add(labelNode, "checked");
//				}

				if (this.direction === "horizontal") {
					dojoClass.add(labelNode, "checkbox-inline");
				}

				spanNode = dojoConstruct.place(dojoConstruct.create("span", {
					"innerHTML": value
				}), labelNode);

				
				
				return labelNode;
			},

			_createCheckboxNode: function (key, value, index) {
				var checkboxNode = null,
					referencedObjects = this._contextObj.get(this._reference);

				checkboxNode = dojoConstruct.create("input", {
					"type": "checkbox",
					"value": key,
					"id": this._reference + "_" + this.id + "_"
				});

				dojoAttr.set(checkboxNode, "name", "checkbox" + this._contextObj.getGuid() + "_" + this.id);

				if (this._isReadOnly ||
					this._contextObj.isReadonlyAttr(this._reference)) {
					dojoAttr.set(checkboxNode, "disabled", "disabled");
					dojoAttr.set(checkboxNode, "readonly", "readonly");
				}

				
				if(referencedObjects !== null && referencedObjects !== "") {
					dojoArray.forEach(referencedObjects, function (ref, i) {
						if (checkboxNode.value === ref) {
							checkboxNode.checked = true;
						}
					}, this);
				}

				this._addOnclickToCheckboxItem(checkboxNode, key);
				
				return checkboxNode;
			},

		_addOnclickToCheckboxItem: function (checkboxNode, rbvalue) {

			this.connect(checkboxNode, "onclick", dojoLang.hitch(this, function () {

					if (this._isReadOnly || 
						this._contextObj.isReadonlyAttr(this._reference)) {
						return;
					}

					if(checkboxNode.checked) {
						this._contextObj.addReference(this._reference, rbvalue);
					}
					else {
						this._contextObj.removeReferences(this._reference, rbvalue);
					}

					if (this.onChangeMicroflow) {
						mx.data.action({
							params: {
								applyto: "selection",
								actionname: this.onChangeMicroflow,
								guids: [this._contextObj.getGuid()]
							},
							error: function (error) {
								console.log("_addOnclickToCheckboxItem: XAS error executing microflow; " + error.description);
							}
						});
					}
				}));
			},

			_execMF: function (obj, mf, callback) {
				
				var params = {
					applyto: "selection",
					actionname: mf,
					guids: []
				};
				if (obj) {
					params.guids = [obj.getGuid()];
				}
				mx.data.action({
					params: params,
					callback: function (objs) {
						if (typeof callback !== "undefined") {
							callback(objs);
						}
					},
					error: function (error) {
						if (typeof callback !== "undefined") {
							callback();
						}
						console.log(error.description);
					}
				}, this);
			},

			_reserveSpace : function ()
			{
				var i = 0;
				for (i; i<50; i++) {
					dojoConstruct.place(dojoConstruct.create("div", {"class" : "checkbox", innerHTML: "&nbsp;"}),this.checkboxComboContainer);
				}
			}
		});
	});
require(["SimpleCheckboxSetSelector/widget/SimpleCheckboxSetSelector"], function () {
	"use strict";
});