const { Resolver } = require('dns').promises;
const resolver = new Resolver();
resolver.setServers(['8.8.8.8']);

module.exports.validateEmail = async (email) => {
  if (typeof email !== 'string') {
    return 'idiot, dont even try (err: bad request)';
  }
  //stage 1 - comman regex email format checking
  if (
    !email ||
    !email.match(
      /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
  ) {
    return 'Enter a valid email address.';
  }
  
  //stage 2 - DNS root checking - pretty comman in temp mail apps
  var error, errorc;
  try{
  const arec = await resolver.resolve(email.split('@')[1])
  } catch(err){
    console.log(err)
    error=0
  }
 try{
  const cnamerecs = await resolver.resolve(email.split('@')[1], 'CNAME')
} catch(err){
  console.log(err)
  errorc=0
}
if(error === 0 && errorc === 0){
  return 'Current email address is invalid or will bounce.'
}

  //stage 2 - DNS MX checking - just to get if this was a bogus email address or typed at random/ by mistake, tho it would trigger stage 2, maybe just a domain with A or CNAME record but no MX. 

  try{
    const mxrec = await resolver.resolve(email.split('@')[1], 'MX')
    if(mxrec.length === 0){
      return 'Current email address is invalid or will bounce.'
    }
   } catch(err){
    error=1
  }

   if(error===1){
    return 'Current email address has typos or is invalid, please recheck.'
   }

   //stage 4 blacklist checking
   const blacklist = ['pussport.com', 'qq.com']
   if(blacklist.includes(email.split('@')[1])){
    return 'Current email address has been blacklisted.'
   }

  return false;
};

module.exports.validateFullName = (fullName) => {
  if (!fullName) {
    return 'Enter a valid name.';
  }
  return false;
};

module.exports.validatePronoun = (noun) => {
  if (noun.length > 10 && noun.length < 3){
    return false;
} else {
  return 'The pronoun should be under 10 Charecters and over 3 Charecters';
} 
};

module.exports.validateUsername = (username) => {
    if (typeof username !== 'string') {
    return 'idiot, dont even try (err: bad request)';
  }
  if (!username) {
    return 'Enter a valid username.';
  } else if (username.length > 30 || username.length < 3) {
    return 'Please choose a username between 3 and 30 characters.';
  } else if (!username.match(/^[a-zA-Z0-9\_.]+$/)) {
    return 'A username can only contain the following: letters A-Z, numbers 0-9 and the symbols _ . ';
  }
  return false;
};

module.exports.validatePassword = (password) => {
  if (!password) {
    return 'Enter a valid password.';
  } else if (password.length < 6) {
    return 'For security purposes we require a password to be at least 6 characters.';
  } else if (
    !password.match(/^(?=.*[A-Z])(?=.*[!@#$&*])(?=.*[0-9])(?=.*[a-z]).{6,}$/)
  ) {
    return 'A password needs to have at least one uppercase letter, one lowercase letter, one special character and one number.';
  }
  return false;
};

module.exports.validateBio = (bio) => {
  if (bio.length > 130) {
    return 'Your bio has to be 120 characters or less.';
  }
  return false;
};

module.exports.validateWebsite = (website) => {
  if (
    !website.match(
      /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/
    )
  ) {
    return 'Please provide a valid website.';
  }
  return false;
};


module.exports.validateBirthday = (dob) => {
const getAge = (birthDateString) => {
  var today = new Date();
  var birthDate = new Date(birthDateString);
  var age = today.getFullYear() - birthDate.getFullYear();
  var m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
  }
  return age;
}

if(getAge(dob) >= 13 && getAge(dob) <= 120) {
  return false;
} else {
  return "Sorry but you have to be 13 or more years old to make a dogegram account! Thanks for checking out anyway :)";  
}


};


module.exports.validatePronoun = (pronoun) => {
  if (pronoun.length < 3 || pronoun.length > 10){
    return 'The pronoun should be under 10 Charecters and over 3 Charecters';
  } else {
    return false
  }
};

