/*
  et n=prompt("enter a number");
  
 let sum=0;
for(let i=1; i<=n;i++){
    sum+=i;
    
}
 console.log("sum = ",sum);
console.log("loops has ended");
*/
/*let i=1;
let n=prompt("enter a number = ");
let sum=0;
do{
    

sum+=i;

i++;

}
while(i<=n);

console.log("sum = ",sum);
/*
for of loops
*/
// let size=0;
// let str="advertisement";
//only use in strings and arrays
// for(let val of str){
    // console.log("value = ",val);
    // size++;
// }
//  console.log("string size = ",size);*


    // For in loops
   let vidya={
    name:"shivam",
    age:20,
    rollno:34,
    cgpa:8,
   };
   for(let key in vidya ){
    console.log("key = ",key,vidya[key]);
   }