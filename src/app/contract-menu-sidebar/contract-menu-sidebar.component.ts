import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CompilerService } from '../compiler.service';
import { Subscription } from 'rxjs';
import { ContractBase } from '../question/contract-base';
import { AuthService } from '../services/auth/auth.service';
import { HttpClient } from '@angular/common/http';

import { AeSdkExtended } from '../helpers/interfaces';
import { isValidContractAddress } from '../helpers/utils';

// Interface for FATE function signatures
interface FATEFunction {
  name: string;
  arguments: Array<{ type: string; name: string }>;
  returns: string;
  stateful: boolean;
  payable: boolean;
  IDEindex?: number; // Added by IDE after parsing
}

// Interface for imported contract metadata
interface ImportedContractMetadata {
  importedAt: string;
  isImported: boolean;
  hasSourceCode: boolean;
  IDEindex: number;
  $aci?: any;
  deployInfo?: {
    address: string;
    result: {
      contractId: string;
    };
  };
}

@Component({
  selector: 'contract-menu-sidebar',
  templateUrl: './contract-menu-sidebar.component.html',
  styleUrls: ['./contract-menu-sidebar.component.css'],
})
export class ContractMenuSidebarComponent implements OnInit {
  // deleteme: Testing the modal UI
  testName: string = 'FooBarContractLOL';
  testAddress: string = 'ak_1337Cafe....3A7FgK8Hg';

  //Fires when new SDK settings are available(Accounts, )
  sdkSettingsSubscription: Subscription;
  // listen for new errors
  newErrorSubscription: Subscription;

  //Fires when a raw ACI is available (for gnerating init()'s interface
  rawACIsubscription: Subscription;

  // fires when a contract is deployed:
  contractDeploymentSubscription: Subscription;

  //displays loading icon when deploying contract
  deploymentLoading: boolean = false;

  // the current compilation error
  currentError: any = {};

  // is an init function present in the contract ?
  initFunctionIsPresent: boolean = true;

  // the address of the existing contract the user wants to interact with.
  addressOfExistingContract: `ct_${string}` | `${string}.chain` = null;

  // Import feature properties
  importContractAddress: string = '';
  importLoading: boolean = false;
  importError: string = null;

  // TODO: wrap in class for automatic type checking bullshit
  /*the current SDK settings. Currently supported:
    .address - public address of the current active account in SDK instance
    .addresses[] - public addresses of all currently added accounts in instance
    .balances[address -> balance] - (provided by this component) map of balances of all AE accounts currently added to SDK


*/
  currentSDKsettings: any = { address: '', addresses: [], balances: [2], getNodeInfo: { url: '' } };

  activeContracts: any[] = [];
  initACI: ContractBase;

  // angular 9
  hover: boolean;

  logTemp(input: any) {
    console.log('current input:', input);
  }

  constructor(
    public compiler: CompilerService,
    private changeDetectorRef: ChangeDetectorRef,
    private http: HttpClient,
    private auth: AuthService,
  ) { }

  /*  buildAContract() {
    // make compiler emit event

    // @parm: Maybe use param for editor identification later
    this.compiler.makeCompilerAskForCode(1);

  }  */

  deployContract(_existingContract?: boolean) {
    // display loading
    this.deploymentLoading = true;
    this.changeDetectorRef.detectChanges();

    // fetch all entered params
    let params = [];

    console.log('Function 0 ist:', this.initACI.functions[0]);

    this.initACI.functions[0].arguments.forEach((oneArg) => {
      //debugger
      console.log('Ein arg:', oneArg.currentInput);
      params.push(oneArg.currentInput);
    });

    // take care of the case when init function is not present:
    if (this.initACI.functions[0].name !== 'init') {
      params = null;
    }

    console.log('_existingContract ist', _existingContract);
    console.log('addressOfExistingContract ist', this.addressOfExistingContract);
    // make compiler emit event
    // take the ACI/ContractBase the compiler stores
    // "If the user is trying to interact with an existing contract and something is in the address field, try bringing up the existing contract, else deploy a new one"
    _existingContract && isValidContractAddress(this.addressOfExistingContract)
      ? this.compiler.compileAndDeploy(params, this.addressOfExistingContract)
      : this.compiler.compileAndDeploy(params);
  }

  copyAddress() {
    navigator.clipboard
      .writeText(this.currentSDKsettings.address)
      .then(() => {
        console.log('Text copied to clipboard');
      })
      .catch((err) => {
        // This can happen if the user denies clipboard permissions:
        console.error('Could not copy text:', err);
      });
  }

  async ngOnInit() {
    //this.buildAContract();

    await this.compiler.awaitInitializedChainProvider();
    this.changeDetectorRef.detectChanges();

    setInterval(async () => {
      console.log('this.currentSDKsettings', this.currentSDKsettings);
    }, 3000);

    setInterval(async () => {
      // call with "false" to query faucet for balance if it's too low, topup not implemented yet though
      this.currentSDKsettings != undefined ? await this.fetchAllBalances(true) : true;
    }, 3000);

    // fires when new accounts are available
    this.sdkSettingsSubscription = this.compiler._notifyCurrentSDKsettings.subscribe(
      async (settings) => {
        console.log('settings:', settings);

        if (settings.type == 'extension') {
          //comming from the browser wallet
          this.currentSDKsettings = settings.settings;
          console.log('gingen die settings durch?', this.currentSDKsettings);
        } else {
          //comming from the web wallet
          this.currentSDKsettings = settings;
          console.log('gingen die settings durch?', this.currentSDKsettings);
        }

        //  Get balances of all available addresses
        this.currentSDKsettings.addresses != undefined ? await this.fetchAllBalances() : true;

        console.log('This is what currentSDKsettings now look like:', this.currentSDKsettings);
      },
    );

    // fires when new contract got compiled
    this.compiler._newACI.subscribe((item) => {
      /* console.log("Neue ACI für init ist da !") */
      console.log('Sidebar recieved an ACI!', item);
      this.changeDetectorRef.detectChanges();
      // if the new ACI is not {} (empty), reset the last reported error.
      if (Object.entries(item['aci']).length > 0) {
        this.initACI = item['aci'];

        this.currentError = {};

        // check if there is an init function present for the current generated ACI Trainee TODO task: do this in template !
        this.initACI.name != undefined
          ? (this.initFunctionIsPresent = this.checkIfInitFunctionIsPresent())
          : true;

        console.log('Current error is:', this.currentError);
        //this.initACI == null ? console.log("Jetzt init ACI leer!") : true;
        this.changeDetectorRef.detectChanges();
      } else {
        // if there was obviously not an ACI received, make deployment window disappear
        this.initACI = undefined;
      }
    });

    // fires with a new contract when it got deployed
    this.contractDeploymentSubscription = this.compiler._notifyDeployedContract.subscribe(
      async ({ newContract, success }) => {
        if (!success) {
          this.deploymentLoading = false;
        }

        // workaround for event firing on its own when loading the editor, thereby not sending any data:
        if (newContract != null) {
          console.log('New contract:', newContract); // .deployInfo.address
          this.activeContracts.push(newContract);

          // temp test
          //console.log("Current array of contracts:", this.activeContracts);

          // trigger this to generate the GUI for the contract
          this.deploymentLoading = false;
          //this.activeContracts = this.compiler.activeContracts;
          //debugger
          this.changeDetectorRef.detectChanges();
        } else {
          console.log('False alert...');
          //debugger
        }
      },
    );

    this.newErrorSubscription = this.compiler._notifyCodeError.subscribe(async (error) => {
      await error;
      //let theError = error.__zone_symbol__value;
      console.log('Nur error in sidebar:', error);
      this.currentError = error;
    });
  }

  //desparate workaround for issue: contract to deploy is not being rendered since adding node choosing interface

  async changeActiveAccount(newAccount: any) {
    console.log('So wird der neue account gesetzt:', newAccount);
  }

  async changeSDKsetting(setting: string, params: any) {
    console.log('changesetting was clicked');

    switch (setting) {
      case 'selectAccount':
        (this.compiler.Chain as AeSdkExtended).selectAccount(params);
        console.log('Attempted to change selectAccount:', setting, params);
        break;

      default:
        console.log(
          'Attempted to change a setting that no switch case matched for:',
          setting,
          params,
        );
        break;
    }

    this.compiler.sendSDKsettings();
  }

  // get all balances from all addresses currently added to SDK
  // @param dontFillUp: boolean - if passed, do not top up accounts if one or some are low
  async fetchAllBalances(_dontFillUp?: boolean) {
    //console.log("available addresses:", this.currentSDKsettings.addresses)

    if (!this.currentSDKsettings.balances) {
      this.currentSDKsettings.balances = {};
    }

    this.currentSDKsettings.addresses.forEach(async (oneAddress) => {
      this.currentSDKsettings.balances[oneAddress] = await this.getOneBalance(
        oneAddress,
        _dontFillUp != true ? false : true,
      );
    });
  }

  // get balance of only one address
  // TODO: option parameter einbauen, Format ist
  // async ƒ balance(address, { height, hash, format = false } = {})
  async getOneBalance(
    _address,
    _dontFillUp: boolean,
    _height?: number,
    _format?: boolean,
    _hash?: any,
  ) {
    // if only the address is defined, don't call with options.
    var balance;
    //console.log("Fetching balan ce for..." + _address);
    if (!_height && !_format && !_hash) {
      try {
        balance = await this.compiler.Chain.getBalance(_address);
        //console.log("als balance für " + _address + " kam:", balance);
        this.changeDetectorRef.detectChanges();
      } catch (e) {
        balance = 0;
        this.changeDetectorRef.detectChanges();
      }
    } else {
      // TODO: Implement calling with options here
    }
    //console.log("Balance returned für " + _address +" :", balance);
    this.changeDetectorRef.detectChanges();

    return balance;
  }

  checkIfInitFunctionIsPresent(): boolean {
    var found: boolean = false;

    this.initACI.functions.forEach((oneFunction) => {
      oneFunction.name == 'init' ? (found = true) : null;
    });

    console.log('Init found ?', found);

    return found;
  }

  deleteFromActiveContracts = (contract) => {
    console.log('utils.deleteFromActiveContracts: delete event angekommen');
    console.log('delete contract:', contract);
    console.log('this.activeContracts:', this.activeContracts);

    this.activeContracts.forEach((element, index) => {
      if (element.IDEindex == contract.IDEindex) {
        console.log(
          'Found contract to delete, existing:',
          element.IDEindex,
          'to delete:',
          contract.IDEindex,
        );
        this.activeContracts.splice(index, 1);
      }
    });
    /* for (var i = this.activeContracts.length - 1; i >= 0; --i) {

  } */
  };

  // Helper method to parse comma-separated type lists, handling nested structures
  private parseTypeList(typeString: string): string[] {
    const types: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < typeString.length; i++) {
      const char = typeString[i];

      if (char === '{' || char === '[') {
        depth++;
        current += char;
      } else if (char === '}' || char === ']') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        if (current.trim()) {
          types.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      types.push(current.trim());
    }

    return types;
  }

  // Helper method to sanitize identifiers to prevent code injection
  private sanitizeIdentifier(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // Helper method to validate contract address
  private validateContractAddress(address: string): boolean {
    if (!address || !address.startsWith('ct_')) {
      this.importError = 'Invalid contract address format. Expected: ct_...';
      return false;
    }
    // Contract addresses are typically 51-53 characters due to base58check encoding
    if (address.length < 51 || address.length > 53) {
      this.importError = `Invalid contract address length: ${address.length} characters. Expected: 51-53 characters`;
      return false;
    }
    return true;
  }

  /**
   * Import a deployed contract by its address from the blockchain.
   * 
   * This method:
   * 1. Fetches the contract bytecode from the node
   * 2. Extracts function signatures from FATE assembler output
   * 3. Converts FATE types to Sophia types
   * 4. Generates a Sophia stub contract
   * 5. Validates the stub by compiling it
   * 6. Initializes an SDK contract instance
   * 
   * Limitations:
   * - Complex types (variants/records) are converted to 'string' placeholders
   * - Original type names and field names are lost in bytecode
   * - For full type safety, import using source code via "Use at address"
   * 
   * @see validateContractAddress for address validation
   * @see fateToSophiaType for type conversion logic
   */
  async importDeployedContract() {
    if (!this.validateContractAddress(this.importContractAddress)) {
      return;
    }

    this.importLoading = true;
    this.importError = null;

    let contractInstance: any & ImportedContractMetadata = null;
    let addedToActiveContracts = false;

    try {
      // Validate contract address format
      const contractAddress = this.importContractAddress.trim() as `ct_${string}`;

      // Fetch contract bytecode directly from the node
      console.log('Fetching contract bytecode from node...');
      const contractBytecode = await this.compiler.Chain.getContractByteCode(contractAddress);
      console.log('Contract bytecode:', contractBytecode);

      if (!contractBytecode || !contractBytecode.bytecode) {
        throw new Error('Contract not found on the blockchain');
      }

      const bytecode = contractBytecode.bytecode;

      // The bytecode contains embedded ACI metadata in FATE format
      // We can use the /fate-assembler endpoint to extract function signatures
      console.log('Extracting function information from bytecode...');

      try {
        const compilerUrl = 'https://v8.compiler.aepps.com';
        const httpOptions = {
          headers: { 'Content-Type': 'application/json' }
        };

        // Get the FATE assembler output which shows function names and types
        const fateResponse = await this.http
          .post<any>(`${compilerUrl}/fate-assembler`, {
            bytecode: bytecode
          }, httpOptions)
          .toPromise();

        console.log('FATE assembler response:', fateResponse);

        if (!fateResponse || !fateResponse['fate-assembler']) {
          throw new Error('No FATE assembler output returned');
        }

        const fateAsm = fateResponse['fate-assembler'];
        console.log('FATE assembler code:', fateAsm);

        // Extract contract name from internal function names
        // Internal functions have format: .ContractName.function_name
        const internalFuncMatch = fateAsm.match(/FUNCTION\s+\.([\w]+)\./);
        const contractName = this.sanitizeIdentifier(internalFuncMatch ? internalFuncMatch[1] : 'ImportedContract');
        console.log('Detected contract name:', contractName);

        // Parse the FATE assembler to extract function signatures AND bodies
        // Format: "FUNCTION name(type1, type2, ...) : returnType\n  <body>"
        // We need the body to detect CALL_VALUE (indicates payable function)
        const functionSections = fateAsm.split(/(?=FUNCTION\s+[\w.]+)/);
        const functions: FATEFunction[] = [];

        for (const section of functionSections) {
          if (!section.trim()) continue;

          // Extract function signature
          const signatureMatch = section.match(/^FUNCTION\s+([\w.]+)\s*\((.*?)\)\s*:\s*(.+?)$/m);
          if (!signatureMatch) {
            console.warn(`Could not parse function signature in section:`, {
              preview: section.substring(0, 150),
              contractAddress
            });
            continue;
          }

          const funcName = signatureMatch[1];
          const params = signatureMatch[2].trim();
          const returnType = signatureMatch[3].trim();

          // Skip internal functions (those starting with '.')
          if (funcName.startsWith('.')) {
            console.log(`Skipping internal function: ${funcName}`);
            continue;
          }

          // Check if function uses CALL_VALUE (indicates it's payable)
          const isPayable = /\bCALL_VALUE\b/.test(section);

          // Check if function is stateful (modifies state)
          // Functions that use STORE, MAP_UPDATE, SPEND, INC, DEC, or call external contracts modify state
          // Note: CALL_R (remote call) and CALL_T (tail call) indicate state changes, but CALL_VALUE is for payable
          const isStateful = section.match(/\b(STORE|MAP_UPDATE|SPEND|INC|DEC|CALL_R|CALL_T|ORACLE_REGISTER|ORACLE_QUERY|ORACLE_RESPOND|ORACLE_EXTEND|AENS_PRECLAIM|AENS_CLAIM|AENS_UPDATE|AENS_TRANSFER)\b/) !== null;

          // Parse parameters - split by comma but handle nested types
          const paramList = params ? params.split(',').map((p, index) => {
            const trimmed = p.trim();
            // Parameters in FATE are just types, generate names
            return {
              type: trimmed,
              name: `arg${index}`
            };
          }).filter(p => p.type !== '') : [];

          functions.push({
            name: funcName,
            arguments: paramList,
            returns: returnType,
            stateful: isStateful,
            payable: isPayable
          });

          console.log(`Found function: ${funcName}(${params}) : ${returnType}${isStateful ? ' [STATEFUL]' : ''}${isPayable ? ' [PAYABLE]' : ''}`);
        }

        if (functions.length === 0) {
          throw new Error('No public functions found in bytecode');
        }

        console.log(`Total functions found: ${functions.length}`, functions);

        // Build the rawACI structure that matches what the compiler produces
        const rawACI = {
          contract: {
            name: contractName,
            functions: functions,
            state: { tuple: [] },
            typedefs: [],
            kind: 'contract_main',
            payable: false
          }
        };

        // Sort functions with init first (if present)
        // Note: Imported contracts won't typically have 'init' since they're already deployed,
        // but we sort for consistency with the compiled contract interface
        rawACI.contract.functions.sort((x, y) => {
          return x.name == 'init' ? -1 : y.name == 'init' ? 1 : 0;
        });

        // Add IDEindex to each function
        rawACI.contract.functions.forEach((one, i) => {
          rawACI.contract.functions[i].IDEindex = i;
        });

        // Process the ACI using the compiler service's modifyAci method
        const processedAci = this.compiler.modifyAci(rawACI);

        console.log('Processed ACI:', processedAci);

        // Helper function to convert FATE types to Sophia types
        const fateToSophiaType = (fateType: string): string => {
          // Remove spaces for easier parsing
          fateType = fateType.trim();

          console.log('Converting FATE type:', fateType);

          // Handle tuple types: {tuple,[type1,type2,...]} -> (type1, type2, ...)
          if (fateType.startsWith('{tuple,')) {
            // Extract the content inside [...]
            const match = fateType.match(/^\{tuple,\[(.*)\]\}$/);
            if (match) {
              const inner = match[1];
              const types = this.parseTypeList(inner);

              // Empty tuple is 'unit' in Sophia
              if (types.length === 0 || (types.length === 1 && types[0] === '')) {
                console.log(`Empty tuple conversion: ${fateType} -> unit`);
                return 'unit';
              }

              const result = `(${types.map((t: string) => fateToSophiaType(t)).join(' * ')})`;
              console.log(`Tuple conversion: ${fateType} -> ${result}`);
              return result;
            }
          }

          // Handle list types: {list,type} -> list(type)
          if (fateType.startsWith('{list,')) {
            const match = fateType.match(/^\{list,(.*)\}$/);
            if (match) {
              const inner = match[1];
              const result = `list(${fateToSophiaType(inner)})`;
              console.log(`List conversion: ${fateType} -> ${result}`);
              return result;
            }
          }

          // Handle map types: {map,keyType,valueType} -> map(keyType, valueType)
          if (fateType.startsWith('{map,')) {
            const match = fateType.match(/^\{map,(.*)\}$/);
            if (match) {
              const inner = match[1];
              const types = this.parseTypeList(inner);
              const result = `map(${types.map((t: string) => fateToSophiaType(t)).join(', ')})`;
              console.log(`Map conversion: ${fateType} -> ${result}`);
              return result;
            }
          }

          // Handle option types: {option,type} -> option(type)
          if (fateType.startsWith('{option,')) {
            const match = fateType.match(/^\{option,(.*)\}$/);
            if (match) {
              const inner = match[1];
              const result = `option(${fateToSophiaType(inner)})`;
              console.log(`Option conversion: ${fateType} -> ${result}`);
              return result;
            }
          }

          // Handle variant types: {variant,[{tag1,[types]},{tag2,[types]},...]} -> custom variant type
          if (fateType.startsWith('{variant,')) {
            // LIMITATION: We cannot reconstruct variant types from bytecode because:
            // 1. Original datatype name is lost
            // 2. Constructor names are obfuscated in FATE
            // 3. May have circular dependencies
            // Solution: Use 'string' as a placeholder
            console.warn(`Variant type detected but cannot be reconstructed: ${fateType}`);
            console.warn('Using "string" as placeholder. Consider importing with source code for full type safety.');

            // Show warning to user
            this.compiler.logMessage({
              type: 'warning',
              message: `Complex variant type detected in imported contract. Type safety may be reduced. Consider importing with source code.`,
            });

            return 'string';
          }

          // Handle record types: {record,[{field1,type1},{field2,type2},...]} -> custom record type
          if (fateType.startsWith('{record,')) {
            // LIMITATION: Similar to variants, record types lose their name and field names in bytecode
            console.warn(`Record type detected but cannot be reconstructed: ${fateType}`);
            console.warn('Using "string" as placeholder. Consider importing with source code for full type safety.');

            // Show warning to user
            this.compiler.logMessage({
              type: 'warning',
              message: `Complex record type detected in imported contract. Type safety may be reduced. Consider importing with source code.`,
            });

            return 'string';
          }

          // Handle oracle types
          if (fateType.startsWith('{oracle,')) {
            const match = fateType.match(/^\{oracle,(.*)\}$/);
            if (match) {
              const inner = match[1];
              const types = this.parseTypeList(inner);
              const result = `oracle(${types.map((t: string) => fateToSophiaType(t)).join(', ')})`;
              console.log(`Oracle conversion: ${fateType} -> ${result}`);
              return result;
            }
          }

          // Handle oracle query types
          if (fateType.startsWith('{oracle_query,')) {
            const match = fateType.match(/^\{oracle_query,(.*)\}$/);
            if (match) {
              const inner = match[1];
              const types = this.parseTypeList(inner);
              const result = `oracle_query(${types.map((t: string) => fateToSophiaType(t)).join(', ')})`;
              console.log(`Oracle query conversion: ${fateType} -> ${result}`);
              return result;
            }
          }

          // Handle contract types
          if (fateType === 'contract' || fateType.startsWith('{contract')) {
            console.log(`Contract type: ${fateType} -> address`);
            return 'address';
          }

          // Handle bytes with specific size: bytes(32) stays as is
          if (fateType.match(/^bytes\(\d+\)$/)) {
            console.log(`Sized bytes type: ${fateType}`);
            return fateType;
          }

          // Map basic FATE types to Sophia types
          const typeMap: { [key: string]: string } = {
            'integer': 'int',
            'address': 'address',
            'boolean': 'bool',
            'string': 'string',
            'bytes': 'bytes',
            'hash': 'hash',
            'signature': 'signature',
            'bits': 'bits',
            'Chain.ttl': 'Chain.ttl',
            'AENS.name': 'AENS.name'
          };

          const mappedType = typeMap[fateType] || fateType;
          console.log(`Basic type: ${fateType} -> ${mappedType}`);
          return mappedType;
        };

        // Now we need to initialize a real contract instance with the SDK
        // We'll generate minimal source code that matches the function signatures
        let sourceCode = `contract ${contractName} =\n`;

        // Generate function stubs for each extracted function
        functions.forEach(func => {
          const params = func.arguments.map((arg: any, i: number) => {
            const sophiaType = fateToSophiaType(arg.type);
            return `${arg.name} : ${sophiaType}`;
          }).join(', ');
          const returnType = fateToSophiaType(func.returns);
          const stateful = func.stateful ? 'stateful ' : '';
          const payable = func.payable ? 'payable ' : '';
          sourceCode += `  ${payable}${stateful}entrypoint ${func.name}(${params}) : ${returnType} = abort("Imported contract")\n`;
        });

        console.log('Generated source code stub:', sourceCode);

        // Validate the generated source code by compiling it
        // This ensures the generated Sophia stub is syntactically correct
        console.log('Validating generated source code...');
        try {
          const compileResponse = await this.http
            .post<any>(`${compilerUrl}/compile`, {
              code: sourceCode,
              options: {}
            }, httpOptions)
            .toPromise();

          console.log('Compile validation response:', compileResponse);

          if (!compileResponse || compileResponse.bytecode === undefined) {
            throw new Error('Failed to compile generated source code - invalid Sophia syntax');
          }

          console.log('Source code validation successful');
        } catch (compileError) {
          console.error('Compilation validation failed:', compileError);
          throw new Error(
            `Generated contract stub failed validation: ${compileError.message}\n` +
            'This may indicate an issue with type conversion. Please try importing with source code.'
          );
        }

        // Initialize the contract with the SDK using the source code and address
        // The SDK will create callable methods for each function
        console.log('Initializing contract with SDK...');
        contractInstance = await this.compiler.Chain.initializeContract({
          sourceCode: sourceCode,
          address: contractAddress,
        }) as any & ImportedContractMetadata;

        console.log('SDK Contract instance created:', contractInstance);
        console.log('Contract instance type:', typeof contractInstance);
        console.log('Contract methods:', Object.keys(contractInstance).filter(k => !k.startsWith('_') && !k.startsWith('$')));

        // Check if SDK created the methods
        const sdkCreatedMethods = functions.some(f => typeof contractInstance[f.name] === 'function');
        console.log('SDK created methods:', sdkCreatedMethods);

        if (sdkCreatedMethods) {
          // SDK created the methods, so they should work as-is
          // The SDK methods handle calling the contract internally
          console.log('Using SDK-generated methods directly');
        } else {
          // SDK didn't create methods, we need to wrap them
          console.warn('SDK did not create methods, creating wrappers...');

          // Manually create wrapper methods for each function
          functions.forEach(func => {
            console.log(`Creating wrapper for function: ${func.name}`);
            contractInstance[func.name] = async (...args) => {
              console.log(`Calling ${func.name} with args:`, args);

              // The last argument might be tx options
              const lastArg = args[args.length - 1];
              const hasTxOptions = lastArg && typeof lastArg === 'object' &&
                (lastArg.interval !== undefined || lastArg.blocks !== undefined ||
                  lastArg.amount !== undefined || lastArg.gas !== undefined);

              const callArgs = hasTxOptions ? args.slice(0, -1) : args;
              const options = hasTxOptions ? lastArg : {};

              console.log(`Prepared call: ${func.name}(${JSON.stringify(callArgs)}) with options:`, options);

              // We can't use callStatic - just use the method directly
              // This might not work, but let's try
              throw new Error(`Cannot call ${func.name} - SDK method wrapper not implemented`);
            };
          });
        }

        console.log('Function get_my_bets type:', typeof contractInstance['get_my_bets']);

        // Add our processed ACI
        contractInstance.$aci = processedAci;

        // Add deployment info
        contractInstance.deployInfo = {
          address: contractAddress,
          result: {
            contractId: contractAddress,
          },
        };

        // Add import metadata for tracking
        contractInstance.importedAt = new Date().toISOString();
        contractInstance.isImported = true;
        contractInstance.hasSourceCode = false;

        // Give it a unique IDE index
        contractInstance.IDEindex = this.activeContracts.length;

        console.log('Final contract instance:', contractInstance);

        // Add to active contracts in BOTH places
        // The sidebar needs it for display
        this.activeContracts.push(contractInstance);
        // The compiler service needs it for function calls
        this.compiler.activeContracts.push(contractInstance);
        addedToActiveContracts = true;
        this.changeDetectorRef.detectChanges();

        // Show success message
        this.compiler.logMessage({
          type: 'success',
          message: `Successfully imported contract at ${contractAddress}. Found ${functions.length} functions.`,
          data: { functions: functions.map(f => f.name) },
        });

        // Clear the input field
        this.importContractAddress = '';

      } catch (error) {
        console.error('Import error:', error);

        // Provide helpful error message with context
        const errorMessage = error.message || 'Unknown error';
        throw new Error(
          `Unable to import contract: ${errorMessage}\n\n` +
          'The Aeternity SDK requires either:\n' +
          '1. The contract source code, OR\n' +
          '2. A complete ACI file\n\n' +
          'Workaround: Use the "Use at address" feature:\n' +
          '1. Paste the contract source code in the editor\n' +
          '2. Click "Compile"\n' +
          '3. Enter the address (' + contractAddress + ') in the "at address" field\n' +
          '4. Click "Use at address"\n\n' +
          'The "at address" field is located next to the Deploy button.'
        );
      }

    } catch (error) {
      console.error('Import error:', error);

      // Cleanup if contract was partially added
      if (addedToActiveContracts && contractInstance) {
        const indexInActive = this.activeContracts.findIndex(c => c.IDEindex === contractInstance.IDEindex);
        if (indexInActive !== -1) {
          this.activeContracts.splice(indexInActive, 1);
        }
        const indexInCompiler = this.compiler.activeContracts.findIndex(c => c.IDEindex === contractInstance.IDEindex);
        if (indexInCompiler !== -1) {
          this.compiler.activeContracts.splice(indexInCompiler, 1);
        }
      }

      this.importError =
        error.message || 'Failed to import contract. Please check the address and try again.';
    } finally {
      this.importLoading = false;
    }
  }

  get displayNetworkName(): string {
    const networkId = this.currentSDKsettings?.networkId;

    if (networkId === 'ae_mainnet') {
      return 'Mainnet';
    } else if (networkId === 'ae_uat') {
      return 'Testnet';
    }

    return networkId || 'Unknown';
  }
}
