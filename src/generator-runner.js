'use strict';

import co from 'co';
import colors from 'colors';
import promptBypass from './prompt-bypass';
import * as buildInActions from './actions';


export default function (plopfileApi, flags) {
	let abort;

	// triggers inquirer with the correct prompts for this generator
	// returns a promise that resolves with the user's answers
	const runGeneratorPrompts = co.wrap(function* (genObject, bypassArr = []) {
		const {prompts} = genObject;

		if (prompts == null) {
			throw Error(`${genObject.name} has no prompts`);
		}

		if (typeof prompts === 'function') {
			return yield prompts(plopfileApi.inquirer);
		}

		// handle bypass data when provided
		const [promptsAfterBypass, bypassAnswers] = promptBypass(prompts, bypassArr, plopfileApi);

		return yield plopfileApi.inquirer
			.prompt(promptsAfterBypass)
			.then(answers => Object.assign(answers, bypassAnswers));
	});

	// Run the actions for this generator
	const runGeneratorActions = co.wrap(function* (genObject, data) {
		var changes = [];          // array of changed made by the actions
		var failures = [];         // array of actions that failed
		var {actions} = genObject; // the list of actions to execute
		const customActionTypes = getCustomActionTypes();
		const actionTypes = Object.assign({}, customActionTypes, buildInActions);

		abort = false;

		// if action is a function, run it to get our array of actions
		if (typeof actions === 'function') { actions = actions(data); }

		// if actions are not defined... we cannot proceed.
		if (actions == null) {
			throw Error(`${genObject.name} has no actions`);
		}

		// if actions are not an array, invalid!
		if (!(actions instanceof Array)) {
			throw Error(`${genObject.name} has invalid actions`);
		}

		for (let [actionIdx, action] of actions.entries()) {
			// bail out if a previous action aborted
			if (abort) {
				failures.push({
					type: action.type || '',
					path: action.path || '',
					error: 'Aborted due to previous action failure'
				});
				continue;
			}

			action.force = (flags.force === true || action.force === true);

			const actionIsFunction = typeof action === 'function';
			const actionCfg = (actionIsFunction ? {} : action);
			const actionLogic = (actionIsFunction ? action : actionTypes[actionCfg.type]);

			if (typeof actionLogic !== 'function') {
				if (actionCfg.abortOnFail !== false) { abort = true; }
				failures.push({
					type: action.type || '',
					path: action.path || '',
					error: `Invalid action (#${actionIdx + 1})`
				});
				continue;
			}

			try {
				const actionResult = yield executeActionLogic(actionLogic, actionCfg, data);
				changes.push(actionResult);
			} catch(failure) {
				failures.push(failure);
			}
		}

		return { changes, failures };
	});

	// handle action logic
	const executeActionLogic = co.wrap(function* (action, cfg, data) {
		const failure = makeErrorLogger(cfg.type || 'function', '', cfg.abortOnFail);

		// convert any returned data into a promise to
		// return and wait on
		let cfgData = cfg.data || {};
		// data can also be a function that returns a data object
		if (typeof cfgData === 'function') { cfgData = yield cfgData(); }
		Object.keys(cfgData || {}).forEach(k => {
			if (typeof data[k] === 'undefined') { data[k] = cfgData[k]; }
		});
		return yield Promise.resolve(action(data, cfg, plopfileApi)).then(
			// show the resolved value in the console
			result => ({
				type: cfg.type || 'function',
				path: colors.blue(result.toString())
			}),
			// a rejected promise is treated as a failure
			function (err) {
				throw failure(err.message || err.toString());
			}
		);
	});

	// request the list of custom actions from the plopfile
	function getCustomActionTypes() {
		return plopfileApi.getActionTypeList()
			.reduce(function (types, name) {
				types[name] = plopfileApi.getActionType(name);
				return types;
			}, {});
	}

	// provide a function to handle action errors in a uniform way
	function makeErrorLogger(type, path, abortOnFail) {
		return function (error) {
			if (abortOnFail !== false) { abort = true; }
			return { type, path, error };
		};
	}

	return {
		runGeneratorActions,
		runGeneratorPrompts
	};
}
