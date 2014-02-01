;function SemanticQueryEngine() {

	var EQUAL = 0,
		GREATER_THAN_OR_EQUAL = 1,
		GREATER_THAN = 2,
		LESS_THAN_OR_EQUAL = -1,
		LESS_THAN = -2;

	var OPERATORS = {
		equal : EQUAL,
		greaterThanOrEqual : GREATER_THAN_OR_EQUAL,
		greaterThan : GREATER_THAN,
		lessThanOrEqual : LESS_THAN_OR_EQUAL,
		lessThan : LESS_THAN
	};

	function SearchModel() {
		this._terms = [];
		this._terms[0] = [];
		this._rules = [];
		this._conflictStrategy = null;
		this._eventHandler = null;
	};

	SearchModel.prototype._name = 'SearchModel';

	SearchModel.prototype._numberExists = function(term) {
		var numbers = this._terms[0].length,
			low = 0,
			high = numbers - 1,
			mid = Math.floor(numbers / 2);

		while (high >= low) {
			var found = this._terms[0][mid];
			if (term === found) {
				return true;
			}

			if (term < found) {
				high = mid - 1;
			}
			else {
				low = mid + 1;
			}
			mid = Math.floor((low + high) / 2);
		}
		return false;
	};

	SearchModel.prototype.addTerm = function(term) {
		if (typeof term === 'number') {
			if (this._numberExists(term)) {
				return;
			}
			this._terms[0].push(term);
			this._terms[0].sort();
			return;
		}

		var word = term.toString(),
			l = word.length;

		if (typeof this._terms[l] === 'undefined') {
			this._terms[l] = word;
			return;
		}

		if (this._terms[l].indexOf(word) > -1) {
			return;
		}

		var num = this._terms[l].length / l,
			terms = [word];

		for (var i = 0; i < num; i++) {
			terms.push(this._terms[l].substring(i*l, i*l+l));
		}
		terms.sort();
		this._terms[l] = terms.join('');
	};

	SearchModel.prototype.addRules = function(rules) {
		if (typeof rules === 'undefined') {
			throw new Error('The specified rules parameter is undefined (calling addRules)');
		}
		for (var i = 0, rulesLength = rules.length; i < rulesLength; i++) {
			for (var j = 0, ruleTermsLength = rules[i].terms.length; j < ruleTermsLength; j++) {
				var t = rules[i].terms[j];
				this.addTerm(t);
			}
		}

		// "compile" rules now that all terms have been reduced to indexed strings
		for (var i = 0, rulesLength = rules.length; i < rulesLength; i++) {
			var rule = [],
				ruleTermsLength = rules[i].terms.length,
				highestGroupIndex = 0,
				terms = rules[i].terms,
				action = rules[i].action,
				args = { 'terms' : terms, 'index' : i };

			if (typeof action === 'undefined' && typeof rules[i]['event'] !== 'undefined') {
				action = this._eventHandler;
			}

			args['event'] = rules[i]['event'] || {};

			for (var j = 0;j < ruleTermsLength; j++) {
				var t = rules[i].terms[j],
					termId = this.getTermId(t),
					groupIndex = termId[0],
					matchIndex = termId[1];

				if (groupIndex > highestGroupIndex) {
					highestGroupIndex = groupIndex;
				}

				if (typeof rule[groupIndex] === 'undefined') {
					rule[groupIndex] = [];
				}

				rule[groupIndex][matchIndex] = termId;
				if (typeof rules[i].operators !== 'undefined'
					&& typeof rules[i].operators[j] != 'undefined') {
					var knownOperator = OPERATORS[rules[i].operators[j].toString()];
					if (typeof knownOperator !== 'undefined') {
						rule[groupIndex][matchIndex][2] = knownOperator;
					}
					else {
						rule[groupIndex][matchIndex][2] = rules[i].operators[j];
					}
				}
				else {
					rule[groupIndex][matchIndex][2] = 0;
				}
			}

			rule[highestGroupIndex + 1] = ruleTermsLength; // append true term counts as condition count

			if (action) {
				// action state is preserved in a closure; for conflict resolution, args are available externally
				rule[highestGroupIndex + 2] = (function(fn,args){var f1=function(){fn.apply(f1, null);};f1.terms=args.terms;f1.index=args.index;f1['event']=args['event'];return f1;})(action,args);
			}
			else {
				throw new Error('All rules require either \'action\' or \'event\' to be defined (if \'event\' is defined, an eventHandler must also be defined, either in the model.eventHandler or by calling addEventHandler); failing at rule index ' + i);
			}

			this._rules.push(rule);
		}
	};

	SearchModel.prototype.getNumberId = function(term) {
		var numbers = this._terms[0].length,
			low = 0,
			high = numbers - 1,
			mid = Math.floor(numbers / 2);

		while (high >= low) {
			var found = this._terms[0][mid];
			if (term === found) {
				return [0, mid];
			}
			if (term < found) {
				high = mid - 1;
			}
			else {
				low = mid + 1;
			}
			mid = Math.floor((low + high) / 2);
		}
		return false;
	};

	SearchModel.prototype.getTermId = function(term) {
		if (typeof term === 'number') {
			return this.getNumberId(term);
		}

		var w = term.toString(),
			l = w.length;
		
		if (!this._terms[l]) {
			return false;
		}

		var terms = this._terms[l].length / l,
			low = 0,
			high = terms - 1,
			mid = Math.floor(terms/2);

		while (high >= low) {
			var idx = l * mid;
			var found = this._terms[l].substr(idx, l);
			if (w === found) {
				return [l, idx / l];
			}
			if (w < found) {
				high = mid - 1;
			} else {
				low = mid + 1;
			}
			mid = Math.floor((low + high) / 2);
		}
		return false;
	};

	SearchModel.prototype.isEqualTermId = function(a,b) {
		if (!a || !b) {
			return false;
		}
		if (a.length !== b.length) {
			return false;
		}
		for (var i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
	};

	SearchModel.prototype.executeQuery = function(state) {
		if (typeof state === 'undefined') {
			throw new Error('Cannot execute query on undefined state');
		}

		var matchingRules = [], agenda = [];

		for (var i = 0, stateLength = state.length; i < stateLength; i++) {
			var t = this.getTermId(state[i]);

			for (var j = 0, rulesLength = this._rules.length; j < rulesLength; j++) {
				if (typeof matchingRules[j] === 'undefined') {
					matchingRules[j] = 0;
				}

				// if the current rule has already been matched in it's entire length, continue
				var size = this._rules[j].length,
					groupCount = this._rules[j][size - 2];
				if (matchingRules[j] == groupCount) {
					continue;
				}

				var groupNumber = t[0],
					groupIndex = t[1],
					group = this._rules[j][groupNumber];

				if (typeof group === 'undefined'
					|| typeof group[groupIndex] === 'undefined'
					|| !(group[groupIndex] instanceof Array)) {
					continue;
				}

				matchingRules[j]++;
			}
		}

		for (var i = 0, matchingRulesLength = matchingRules.length; i < matchingRulesLength; i++) {
			var size = this._rules[i].length,
				groupCount = this._rules[i][size - 2];

			if (matchingRules[i] === groupCount) {
				var action = this._rules[i][size - 1]; // action is always the last item
				agenda.push(action); 
			}
		}

		if (typeof this._conflictStrategy === 'function') {
			this._conflictStrategy.apply(agenda, null);
		}

		return agenda;
	};

	this._searchModel = new SearchModel();
};

SemanticQueryEngine.prototype._name = 'SemanticQueryEngine';

SemanticQueryEngine.prototype.addDataModel = function(model) {
	if (model instanceof Array) {
		this._searchModel.addRules(model);
		return;
	}

	this._searchModel._conflictStrategy = model.conflictStrategy || this._searchModel._conflictStrategy;
	this._searchModel._eventHandler = model.eventHandler || this._searchModel._eventHandler;
	if (typeof model._terms !== 'undefined' && model._terms.length > 0
		&& typeof model._rules !== 'undefined' && model._rules.length > 0) {
		// "pre-compiled" rules incoming
		this._searchModel._terms = model._terms;
		this._searchModel._rules = model._rules;
	}
	else {
		this._searchModel.addRules(model.rules);
	}
};
SemanticQueryEngine.prototype.addConflictStrategy = function(fn) {
	this._searchModel._conflictStrategy = fn;
};
SemanticQueryEngine.prototype.isEqualTermId = function(a,b) { // primarily for testing purposes
	return this._searchModel.isEqualTermId(a,b);
};
SemanticQueryEngine.prototype.getNumberId = function(term) { // primarily for testing purposes
	return this._searchModel.getNumberId(term);
};
SemanticQueryEngine.prototype.getTermId = function(term) { // primarily for testing purposes
	return this._searchModel.getTermId(term);
};
SemanticQueryEngine.prototype.executeQuery = function(state) {
	return this._searchModel.executeQuery(state);
};
SemanticQueryEngine.prototype.addEventHandler = function(fn) {
	this._searchModel._eventHandler = fn;
};
