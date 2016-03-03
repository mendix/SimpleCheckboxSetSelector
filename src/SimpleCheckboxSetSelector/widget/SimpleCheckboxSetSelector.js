/*jslint white:true, nomen: true, plusplus: true */
/*jshint -W083*/
/*global mx, define, require, browser, devel, console, document, jQuery, mxui, dojo */
/*mendix */
define([
	'dojo/_base/declare',
	'mxui/widget/_WidgetBase',
	'dijit/_TemplatedMixin',
	'mxui/dom',
	'dojo/on',
	'dojo/dom-class',
	'dojo/dom-style',
	'dojo/dom-construct',
	'dojo/dom-attr',
	'dojo/_base/lang',
	'dojo/html',
	'dojo/_base/array',
	'dojo/text!SimpleCheckboxSetSelector/widget/template/SimpleCheckboxSetSelector.html'
],
	function (declare, _WidgetBase, _TemplatedMixin, dom, on, dojoClass, dojoStyle, dojoConstruct, dojoAttr, dojoLang, dojoHtml, dojoArray, widgetTemplate) {
		"use strict";

		// Declare widget.
		return declare("SimpleCheckboxSetSelector.widget.SimpleCheckboxSetSelector", [_WidgetBase, _TemplatedMixin], {

			// Template path
			templateString: widgetTemplate,

			// DOM elements
			checkboxComboContainer: null,
			showMoreButton : null,

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
			_checkboxOptionsArray: [],
			_isReadOnly: false,
			_assocName: null,
			_locatedInListview: false,
			_checkboxesArr: null,
			_showMoreHidden: true,
			_showMoreButtonHandler: null,

			_showMoreStarted: false,

			/**
			 * Mendix Widget methods.
			 * ======================
			 */
			constructor: function () {
				// Uncomment next line to start debugging
				//logger.level(logger.DEBUG);
				this._handles = [];
			},

			// DOJO.WidgetBase -> PostCreate is fired after the properties of the widget are set.
			postCreate: function () {
				logger.debug(this.id + '.postCreate');
				this._checkboxesArr = [];
				this._entity = this.dataAssociation.split('/')[1];
				this._reference = this.dataAssociation.split('/')[0];
				this._labelAttribute = this.displayAttribute;

				if (this.sortAttr === '') {
					this.sortAttr = this.displayAttribute;
				}

				// adjust the template based on the display settings.
				if (this.showLabel) {
					if (dojoClass.contains(this.checkboxLabel, 'hidden')) {
						dojoClass.remove(this.checkboxLabel, 'hidden');
					}

					if (this.formOrientation === "horizontal") {
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

			},

			/**
			 * What to do when data is loaded?
			 */

			update: function (obj, callback) {
				logger.debug(this.id + '.update');

				this._contextObj = obj;
				this._resetSubscriptions();
				this._setCheckboxOptions();

				callback();
			},

			_setCheckboxOptions: function () {
				logger.debug(this.id + '._setCheckboxOptions');

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
				logger.debug(this.id + '._updateRendering');

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
				logger.debug(this.id + '._handleValidation');
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
				logger.debug(this.id + '._clearValidations');
				dojoConstruct.destroy(this._alertDiv);
				this._alertDiv = null;
			},

			// Show an error message.
			_showError: function (message) {
				logger.debug(this.id + '._showError');
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
				logger.debug(this.id + '._addValidation');
				this._showError(message);
			},

			// Reset subscriptions.
			_resetSubscriptions: function () {
				logger.debug(this.id + '._resetSubscriptions');
				this.unsubscribeAll();
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
				logger.debug(this.id + '._getDataFromXPath');
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
					logger.warn(this.id + "._getDataFromXPath -- Warning: No context object available.");
				}
			},

			_getDataFromDatasource: function () {
				logger.debug(this.id + '._getDataFromDatasource');
				this._execMF(this._contextObj, this.datasourceMf, dojoLang.hitch(this, this._populateCheckboxOptions));
			},

			_populateCheckboxOptions: function (objs) {
				logger.debug(this.id + '._populateCheckboxOptions');

				this._checkboxOptions = {};
				this._checkboxOptionsArray = [];

				for (var i = 0; i < objs.length; i++) {
					var mxObj = objs[i];
					this._checkboxOptions[mxObj.getGuid()] = mxObj.get(this.displayAttribute);

					var checkboxObj = {
						//i: i,
						guid: mxObj.getGuid(),
						value: mxObj.get(this.displayAttribute),
						checked: false
					};

					var referencedObjects = this._contextObj.get(this._reference);
					if (referencedObjects !== null && referencedObjects !== "") {
						dojoArray.forEach(referencedObjects, function (ref, i) {
							if (mxObj.getGuid() === ref) {
								checkboxObj.checked = true;
							}
						}, this);
					}

					this._checkboxOptionsArray.push(checkboxObj);
				}

                var _checked = [];
                var _unchecked = [];

                for (var x = 0; x < this._checkboxOptionsArray.length; x++) {
                    var checkbox = this._checkboxOptionsArray[x];
                    if (checkbox.checked) {
                        _checked.push(checkbox);
                    } else {
                        _unchecked.push(checkbox);
                    }
                }

                this._checkboxOptionsArray = _checked.concat(_unchecked);

				this._updateRendering();
			},


			_createCheckboxNodes: function (mxObjArr) {
				logger.debug(this.id + '._createCheckboxNodes');
				var mxObj = null,
					i = 0,
					j = 0,
					labelNode = null,
					checkboxNode = null,
					enclosingDivElement = null,
					nodelength = 0;

				nodelength = this.checkboxComboContainer.children.length;
				this._checkboxesArr = [];

				if (this.direction === "horizontal") {
					dojoConstruct.empty(this.checkboxComboContainer);
				}

				for (var o = 0; o < this._checkboxOptionsArray.length; o++) {
					var option = this._checkboxOptionsArray[o];
					if (option.value) {
						labelNode = this._createLabelNode(option.guid, option.value);
						checkboxNode = this._createCheckboxNode(option.guid, option.value);

						dojoConstruct.place(checkboxNode, labelNode, "first");

						if (this.direction === "horizontal") {
							dojoConstruct.place(labelNode, this.checkboxComboContainer, "last");
							this._checkboxesArr.push(checkboxNode);
						} else {
							//an enclosing div element is required to vertically align a  in bootstrap.
							if (this.checkboxComboContainer.children[i]) {
								enclosingDivElement = this.checkboxComboContainer.children[i];
							} else {
								enclosingDivElement = dojoConstruct.create("div", { "class": "checkbox" });
							}
							dojoConstruct.place(labelNode, enclosingDivElement, "only");
							if (!this.checkboxComboContainer.children[i]) {
								dojoConstruct.place(enclosingDivElement, this.checkboxComboContainer, "last");
							}
							this._checkboxesArr.push(enclosingDivElement);
						}

						i++;
					}
				}
				j = i;
				if (j > 0) {
					for (j; j <= nodelength; j++) {
						dojoConstruct.destroy(this.checkboxComboContainer.children[i]);
					}
				}

				// i is the number of checkboxes.
				if (this.showMore > 0 && i > this.showMore) {
					this._enableShowMore();
				}
			},

			_setShowMoreHidden: function () {
				logger.debug(this.id + '._setShowMoreHidden');
				for (var i = 0; i < this._checkboxesArr.length; i++) {
					var node = this._checkboxesArr[i];
					if (i >= this.showMore) {
						dojoClass.add(node, 'showmore-hidden');
					}
				}
				this.showMoreButton.innerHTML = 'Show more';
				this.showMoreHidden = true;
			},

			_setShowMoreShown: function () {
				logger.debug(this.id + '._setShowMoreShown');
				for (var i = 0; i < this._checkboxesArr.length; i++) {
					var node = this._checkboxesArr[i];
					if (dojoClass.contains(node, 'showmore-hidden')) {
						dojoClass.remove(node, 'showmore-hidden');
					}
				}

				this.showMoreButton.innerHTML = 'Hide';
				this.showMoreHidden = false;
			},

			_enableShowMore: function () {
				logger.debug(this.id + '._enableShowMore');
				if (!this._showMoreStarted) {
					this._setShowMoreHidden();
					this._showMoreStarted = true;
				}

				dojoStyle.set(this.showMoreButton, 'display', 'inline-block');
				if (!this._showMoreButtonHandler) {
					this._showMoreButtonHandler = on(this.showMoreButton, "click", dojoLang.hitch(this, function () {
						if (this.showMoreHidden) {
							this._setShowMoreShown();
						} else {
							this._setShowMoreHidden();
						}
					}));
				}
			},

			_createLabelNode: function (key, value) {
				logger.debug(this.id + '._createLabelNode');
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
				logger.debug(this.id + '._createCheckboxNode');
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


				if (referencedObjects !== null && referencedObjects !== "") {
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
				logger.debug(this.id + '._addOnclickToCheckboxItem');

				this.connect(checkboxNode, "onclick", dojoLang.hitch(this, function () {

					if (this._isReadOnly ||
						this._contextObj.isReadonlyAttr(this._reference)) {
						return;
					}

					if (checkboxNode.checked) {
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
				logger.debug(this.id + '._execMF', mf);
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
			}
		});
	});
require(["SimpleCheckboxSetSelector/widget/SimpleCheckboxSetSelector"], function () {
	"use strict";
});
